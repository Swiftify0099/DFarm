import crypto from 'node:crypto';
import { db } from '../../../infrastructure/database/PostgresPool.js';
import { MilkCollectionTransaction } from '../../../domain/entities/MilkCollectionTransaction.js';
import { MilkWeight, FatPercentage, SnfPercentage } from '../../../domain/value-objects/index.js';
import { RateService } from '../../../modules/rates/rate.service.js';
import { offlineSessionAuthService } from '../../../infrastructure/security/OfflineSessionAuthorizationService.js';
import { realtimePublisher } from '../../../infrastructure/realtime/RealtimeEventPublisher.js';
export class BulkCollectionSyncUseCase {
    customerRepo;
    sessionRepo;
    transactionRepo;
    constructor(customerRepo, sessionRepo, transactionRepo) {
        this.customerRepo = customerRepo;
        this.sessionRepo = sessionRepo;
        this.transactionRepo = transactionRepo;
    }
    async execute(params) {
        const { organizationId, operatorId, operatorName, authenticatedDeviceId, requestId, batch } = params;
        if (!organizationId || !organizationId.trim()) {
            throw new Error('Authenticated organization ID is strictly required for bulk sync');
        }
        const orgId = organizationId.trim();
        const transactions = Array.isArray(batch.transactions) ? batch.transactions : [];
        // Enforce max batch size protection
        const MAX_BATCH_SIZE = 100;
        if (transactions.length > MAX_BATCH_SIZE) {
            const err = new Error(`Payload too large: maximum batch size is ${MAX_BATCH_SIZE} transactions. Received ${transactions.length}.`);
            err.statusCode = 413;
            err.code = 'BATCH_SIZE_EXCEEDED';
            throw err;
        }
        const results = [];
        const batchSeenKeys = new Map();
        // Verify Station Status (BLOCKED or DECOMMISSIONED or REVOKED stations cannot sync)
        const targetDeviceId = authenticatedDeviceId || batch.deviceId;
        if (targetDeviceId && targetDeviceId.trim()) {
            try {
                const cleanDevId = targetDeviceId.trim();
                const devRes = await db.query(`SELECT id, organization_id, status, is_blocked, revoked_at, public_key, device_token_hash FROM devices WHERE device_identifier = $1 OR id::text = $1;`, [cleanDevId]);
                if (devRes.rows && devRes.rows.length > 0) {
                    const dev = devRes.rows[0];
                    const isRevoked = dev.status === 'REVOKED' ||
                        dev.status === 'DECOMMISSIONED' ||
                        dev.revoked_at !== null ||
                        (dev.public_key === null && dev.device_token_hash === null && dev.status !== 'ACTIVE');
                    const isBlocked = dev.status === 'BLOCKED' || dev.is_blocked === true;
                    if (isBlocked || isRevoked || dev.status !== 'ACTIVE') {
                        for (const item of transactions) {
                            const clientIntakeUuid = item.clientIntakeUuid || crypto.randomUUID();
                            const idempotencyKey = item.idempotencyKey || `SYNC-${clientIntakeUuid}`;
                            results.push({
                                clientIntakeUuid,
                                idempotencyKey,
                                status: 'REJECTED',
                                isIdempotentReplay: false,
                                errorCode: isBlocked ? 'DEVICE_BLOCKED' : 'DEVICE_REVOKED',
                                errorMessage: `Station '${cleanDevId}' status is ${dev.status}. Synchronization from revoked or blocked station is strictly rejected. Pending offline transactions remain preserved locally for administrator audit.`,
                            });
                        }
                        return {
                            batchId: batch.batchId || crypto.randomUUID(),
                            requestId,
                            summary: {
                                received: transactions.length,
                                accepted: 0,
                                replayed: 0,
                                rejected: transactions.length,
                                retryable: 0,
                            },
                            results,
                        };
                    }
                    if (dev.organization_id !== orgId) {
                        for (const item of transactions) {
                            const clientIntakeUuid = item.clientIntakeUuid || crypto.randomUUID();
                            const idempotencyKey = item.idempotencyKey || `SYNC-${clientIntakeUuid}`;
                            results.push({
                                clientIntakeUuid,
                                idempotencyKey,
                                status: 'REJECTED',
                                isIdempotentReplay: false,
                                errorCode: 'CROSS_TENANT_DEVICE_BLOCKED',
                                errorMessage: `Station '${cleanDevId}' belongs to a different dairy organization. Cross-organization synchronization rejected.`,
                            });
                        }
                        return {
                            batchId: batch.batchId || crypto.randomUUID(),
                            requestId,
                            summary: {
                                received: transactions.length,
                                accepted: 0,
                                replayed: 0,
                                rejected: transactions.length,
                                retryable: 0,
                            },
                            results,
                        };
                    }
                }
            }
            catch (err) {
                // Fallback to item-level validation if query fails
            }
        }
        // Process each item in controlled loop (never unbounded Promise.all to protect DB connection pool)
        for (const item of transactions) {
            const clientIntakeUuid = item.clientIntakeUuid || crypto.randomUUID();
            const idempotencyKey = item.idempotencyKey || `SYNC-${clientIntakeUuid}`;
            // In-Batch duplicate idempotencyKey protection
            if (batchSeenKeys.has(idempotencyKey)) {
                const earlier = batchSeenKeys.get(idempotencyKey);
                const earlierItem = earlier.item;
                const mismatches = [];
                if (item.customerId !== earlierItem.customerId)
                    mismatches.push('customerId');
                if ((item.milkCategory || 'COW') !== (earlierItem.milkCategory || 'COW'))
                    mismatches.push('milkCategory');
                const itemWeight = Number(item.weightLiters ?? item.quantityLiters ?? 0);
                const earlierWeight = Number(earlierItem.weightLiters ?? earlierItem.quantityLiters ?? 0);
                if (Math.abs(itemWeight - earlierWeight) > 0.005)
                    mismatches.push('weight');
                const itemFat = Number(item.fatPercentage ?? item.fat ?? 0);
                const earlierFat = Number(earlierItem.fatPercentage ?? earlierItem.fat ?? 0);
                if (Math.abs(itemFat - earlierFat) > 0.05)
                    mismatches.push('fat');
                const itemSnf = Number(item.snfPercentage ?? item.snf ?? 0);
                const earlierSnf = Number(earlierItem.snfPercentage ?? earlierItem.snf ?? 0);
                if (Math.abs(itemSnf - earlierSnf) > 0.05)
                    mismatches.push('snf');
                if (mismatches.length > 0) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
                        errorMessage: `Duplicate idempotency key '${idempotencyKey}' within same batch with conflicting attributes: ${mismatches.join(', ')}`,
                    });
                }
                else {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REPLAYED',
                        serverTransactionId: earlier.result.serverTransactionId,
                        receiptNumber: earlier.result.receiptNumber,
                        isIdempotentReplay: true,
                    });
                }
                continue;
            }
            try {
                // 1. Basic Field Validation
                if (!item.customerId) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'MISSING_CUSTOMER_ID',
                        errorMessage: 'Customer ID is required',
                    });
                    continue;
                }
                // Check per-transaction device if distinct from targetDeviceId
                if (item.deviceId && item.deviceId.trim() && item.deviceId.trim() !== (targetDeviceId || '').trim()) {
                    try {
                        const itemDevRes = await db.query(`SELECT id, organization_id, status FROM devices WHERE device_identifier = $1 OR id::text = $1;`, [item.deviceId.trim()]);
                        if (itemDevRes.rows && itemDevRes.rows.length > 0) {
                            const itemDev = itemDevRes.rows[0];
                            if (itemDev.status === 'BLOCKED' || itemDev.status === 'DECOMMISSIONED') {
                                results.push({
                                    clientIntakeUuid,
                                    idempotencyKey,
                                    status: 'REJECTED',
                                    isIdempotentReplay: false,
                                    errorCode: 'DEVICE_BLOCKED',
                                    errorMessage: `Station '${item.deviceId.trim()}' status is ${itemDev.status}. Sync rejected.`,
                                });
                                continue;
                            }
                            if (itemDev.organization_id !== orgId) {
                                results.push({
                                    clientIntakeUuid,
                                    idempotencyKey,
                                    status: 'REJECTED',
                                    isIdempotentReplay: false,
                                    errorCode: 'CROSS_TENANT_DEVICE_BLOCKED',
                                    errorMessage: `Station '${item.deviceId.trim()}' belongs to a different dairy organization. Sync rejected.`,
                                });
                                continue;
                            }
                        }
                    }
                    catch { }
                }
                const rawWeight = Number(item.weightLiters ?? item.quantityLiters);
                const rawFat = Number(item.fatPercentage ?? item.fat);
                const rawSnf = Number(item.snfPercentage ?? item.snf);
                const rawRate = Number(item.ratePerLiter);
                const rawTotal = Number(item.totalAmount);
                const milkCategory = (item.milkCategory || 'COW');
                // Reject non-finite, missing, or negative financial/measurement values
                if (!Number.isFinite(rawWeight) ||
                    !Number.isFinite(rawFat) ||
                    !Number.isFinite(rawSnf) ||
                    !Number.isFinite(rawRate) ||
                    !Number.isFinite(rawTotal) ||
                    rawWeight <= 0 ||
                    rawRate <= 0 ||
                    rawTotal <= 0) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'INVALID_FINANCIAL_VALUES',
                        errorMessage: 'Measurement and financial inputs (weight, fat, snf, rate, total) must be valid, finite, positive numbers',
                    });
                    continue;
                }
                // Validate domain value objects
                try {
                    new MilkWeight(rawWeight);
                    new FatPercentage(rawFat, milkCategory);
                    new SnfPercentage(rawSnf, milkCategory);
                }
                catch (voErr) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'INVALID_MEASUREMENT_VALUES',
                        errorMessage: voErr.message || 'Measurements out of biological bounds',
                    });
                    continue;
                }
                // 2. Validate Customer Ownership & Permissions
                const customer = await this.customerRepo.findById(item.customerId, orgId);
                if (!customer) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'CUSTOMER_NOT_FOUND',
                        errorMessage: `Customer ${item.customerId} not found in authenticated dairy`,
                    });
                    continue;
                }
                if (customer.organizationId !== orgId) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'CROSS_TENANT_CUSTOMER_BLOCKED',
                        errorMessage: 'Customer belongs to a different dairy organization',
                    });
                    continue;
                }
                if (customer.status !== 'ACTIVE') {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'CUSTOMER_SUSPENDED',
                        errorMessage: `Customer status is ${customer.status}`,
                    });
                    continue;
                }
                try {
                    customer.validateCanDeliver(milkCategory);
                }
                catch (catErr) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'CATEGORY_NOT_PERMITTED',
                        errorMessage: catErr.message || `Customer not authorized to deliver ${milkCategory}`,
                    });
                    continue;
                }
                // 3. Resolve Session & Offline Reconciliation Rules
                let session = item.sessionId
                    ? await this.sessionRepo.findById(item.sessionId, orgId)
                    : null;
                if (!session && item.sessionCode) {
                    session = await this.sessionRepo.findByCode(item.sessionCode, orgId);
                }
                if (!session) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'SESSION_NOT_FOUND',
                        errorMessage: `Session ${item.sessionId || item.sessionCode || 'UNKNOWN'} not found in authorized dairy`,
                    });
                    continue;
                }
                if (session.organizationId !== orgId) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'CROSS_TENANT_SESSION_BLOCKED',
                        errorMessage: 'Session belongs to a different dairy organization',
                    });
                    continue;
                }
                // Center cross-matching
                if (session.centerId && customer.centerId && session.centerId !== customer.centerId) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'CROSS_CENTER_SESSION_MISMATCH',
                        errorMessage: `Session center ${session.centerId} does not match customer center ${customer.centerId}`,
                    });
                    continue;
                }
                // Business date matching
                const businessDate = item.businessDate || session.businessDate;
                if (session.businessDate && item.businessDate && session.businessDate !== item.businessDate) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'SESSION_BUSINESS_DATE_MISMATCH',
                        errorMessage: `Session date ${session.businessDate} does not match transaction date ${item.businessDate}`,
                    });
                    continue;
                }
                // 3.1 Closed Session & Offline Authorization Verification
                // RULE: A batch-level offline lease must never silently override or replace a transaction's original per-item lease.
                // If an item's original lease is missing, reject or pause that item for manual review. Never substitute the currently active session lease.
                let rawAuthToken = item.offlineAuthorizationToken;
                if (!rawAuthToken && batch.offlineAuthorizationToken) {
                    // A batch-level lease must NEVER replace a transaction's missing lease in a mixed batch or across different sessions
                    const hasPerItemLeasesInBatch = transactions.some((t) => t.offlineAuthorizationToken);
                    if (hasPerItemLeasesInBatch) {
                        results.push({
                            clientIntakeUuid,
                            idempotencyKey,
                            status: 'REJECTED',
                            isIdempotentReplay: false,
                            errorCode: 'OFFLINE_AUTHORIZATION_MISSING',
                            errorMessage: `Per-item offline authorization lease is missing for transaction ${clientIntakeUuid}. Batch-level lease cannot substitute or override per-item lease. Paused for manual review.`,
                        });
                        continue;
                    }
                    // In legacy homogeneous single-session batches, verify that the batch lease strictly binds to this exact session
                    const batchTokenResult = offlineSessionAuthService.verifyToken(batch.offlineAuthorizationToken);
                    if (batchTokenResult.isValid && batchTokenResult.payload?.sessionId === session.id) {
                        rawAuthToken = batch.offlineAuthorizationToken;
                    }
                    else {
                        results.push({
                            clientIntakeUuid,
                            idempotencyKey,
                            status: 'REJECTED',
                            isIdempotentReplay: false,
                            errorCode: 'OFFLINE_AUTHORIZATION_MISSING',
                            errorMessage: `Per-item offline authorization lease is missing for transaction ${clientIntakeUuid}. Batch lease does not bind to session ${session.sessionCode} and cannot substitute as active session lease. Paused for manual review.`,
                        });
                        continue;
                    }
                }
                if (session.status === 'CLOSED') {
                    // Closed session strictly requires a valid server-issued offline session authorization token
                    if (!rawAuthToken) {
                        results.push({
                            clientIntakeUuid,
                            idempotencyKey,
                            status: 'REJECTED',
                            isIdempotentReplay: false,
                            errorCode: 'OFFLINE_AUTHORIZATION_MISSING',
                            errorMessage: `Closed session intake requires the transaction's original server-issued offline authorization token. Session ${session.sessionCode} is closed and per-item lease is missing. Paused for manual review.`,
                        });
                        continue;
                    }
                    const scopeValidation = offlineSessionAuthService.validateSessionScope({
                        token: rawAuthToken,
                        organizationId: orgId,
                        session: {
                            id: session.id,
                            sessionCode: session.sessionCode,
                            organizationId: session.organizationId,
                            centerId: session.centerId,
                            businessDate: session.businessDate,
                            deviceIdentifier: session.deviceIdentifier,
                            openedAt: session.openedAt,
                            closedAt: session.closedAt,
                        },
                        authenticatedDeviceId,
                        deviceId: item.deviceId,
                        businessDate: item.businessDate,
                        collectionTimestamp: item.collectionTimestamp,
                    });
                    if (!scopeValidation.isValid) {
                        results.push({
                            clientIntakeUuid,
                            idempotencyKey,
                            status: 'REJECTED',
                            isIdempotentReplay: false,
                            errorCode: scopeValidation.errorCode || 'OFFLINE_AUTHORIZATION_INVALID',
                            errorMessage: scopeValidation.errorMessage || 'Offline session authorization validation failed',
                        });
                        continue;
                    }
                }
                else if (rawAuthToken) {
                    // If authorization token is provided for an OPEN session, validate it for tamper and scope consistency
                    const scopeValidation = offlineSessionAuthService.validateSessionScope({
                        token: rawAuthToken,
                        organizationId: orgId,
                        session: {
                            id: session.id,
                            sessionCode: session.sessionCode,
                            organizationId: session.organizationId,
                            centerId: session.centerId,
                            businessDate: session.businessDate,
                            deviceIdentifier: session.deviceIdentifier,
                            openedAt: session.openedAt,
                            closedAt: session.closedAt,
                        },
                        authenticatedDeviceId,
                        deviceId: item.deviceId,
                        businessDate: item.businessDate,
                        collectionTimestamp: item.collectionTimestamp,
                    });
                    if (!scopeValidation.isValid) {
                        results.push({
                            clientIntakeUuid,
                            idempotencyKey,
                            status: 'REJECTED',
                            isIdempotentReplay: false,
                            errorCode: scopeValidation.errorCode || 'OFFLINE_AUTHORIZATION_INVALID',
                            errorMessage: scopeValidation.errorMessage || 'Offline session authorization validation failed',
                        });
                        continue;
                    }
                }
                // 4. Validate Historical Rate Version and Mathematical Precision
                const rateValidation = await RateService.validateHistoricalRate({
                    organizationId: orgId,
                    centerId: customer.centerId || session.centerId,
                    milkCategory,
                    fat: rawFat,
                    snf: rawSnf,
                    weightLiters: rawWeight,
                    ratePerLiter: rawRate,
                    totalAmount: rawTotal,
                    businessDate,
                    rateChartVersionId: item.rateChartVersionId,
                    rateChartId: item.rateChartId,
                    rateChartVersionNumber: item.rateChartVersion,
                });
                if (!rateValidation.isValid) {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: rateValidation.errorCode || 'RATE_VALIDATION_FAILED',
                        errorMessage: rateValidation.errorMessage || 'Rate validation failed',
                    });
                    continue;
                }
                // 5. Construct MilkCollectionTransaction Entity
                const transactionId = clientIntakeUuid;
                const transactionCode = `TXN-${transactionId.substring(0, 8).toUpperCase()}`;
                const transaction = new MilkCollectionTransaction({
                    id: transactionId,
                    transactionCode,
                    sessionId: session.id,
                    dairyId: orgId,
                    centerId: customer.centerId || session.centerId,
                    customerId: customer.id,
                    customerCode: customer.farmerCode,
                    customerName: customer.fullName,
                    timestamp: item.collectionTimestamp || new Date().toISOString(),
                    date: businessDate,
                    shift: session.shift,
                    milkCategory,
                    weightLiters: rawWeight,
                    fatPercentage: rawFat,
                    snfPercentage: rawSnf,
                    clrDensity: item.clrDensity || 28.0,
                    appliedRatePerLiter: rateValidation.authoritativeRate,
                    rateChartVersion: rateValidation.versionNumber,
                    totalAmount: rateValidation.authoritativeTotal,
                    identificationMethod: item.identificationMethod || 'MANUAL_SEARCH',
                    syncStatus: 'SYNCED_CLOUD',
                    deviceId: item.deviceId || session.deviceIdentifier || 'KIOSK_MAIN',
                    operatorName: operatorName,
                    idempotencyKey,
                });
                // 6. Atomic Persistence (Atomic Insert + Session Tally + Farmer Ledger Credit)
                const atomicResult = await this.transactionRepo.saveAtomicIntake({
                    transaction,
                    session,
                    totalAmount: rateValidation.authoritativeTotal,
                    weightLiters: rawWeight,
                    fatPercentage: rawFat,
                    snfPercentage: rawSnf,
                    milkCategory,
                    customerId: customer.id,
                    organizationId: orgId,
                    centerId: customer.centerId || session.centerId,
                    operatorId,
                    operatorName,
                    appliedRate: rateValidation.authoritativeRate,
                });
                const finalResult = atomicResult.isIdempotentReplay
                    ? {
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REPLAYED',
                        serverTransactionId: atomicResult.transaction.id,
                        receiptNumber: atomicResult.receiptNumber,
                        isIdempotentReplay: true,
                    }
                    : {
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'ACCEPTED',
                        serverTransactionId: atomicResult.transaction.id,
                        receiptNumber: atomicResult.receiptNumber,
                        isIdempotentReplay: false,
                    };
                results.push(finalResult);
                batchSeenKeys.set(idempotencyKey, { item, result: finalResult });
                // Broadcast verified post-commit event to Dairy Admin Realtime SSE subscribers
                try {
                    realtimePublisher.broadcast({
                        eventId: `EVT-COLL-${atomicResult.transaction.id}`,
                        eventType: atomicResult.isIdempotentReplay ? 'COLLECTION_SYNCED' : 'COLLECTION_ACCEPTED',
                        schemaVersion: 1,
                        organizationId: orgId,
                        centerId: customer.centerId || session.centerId,
                        entityId: atomicResult.transaction.id,
                        aggregateVersion: 1,
                        occurredAt: item.collectionTimestamp || new Date().toISOString(),
                        publishedAt: new Date().toISOString(),
                        payload: {
                            collectionId: atomicResult.transaction.id,
                            transactionCode: atomicResult.transaction.transactionCode,
                            receiptNumber: atomicResult.receiptNumber,
                            clientIntakeUuid,
                            idempotencyKey,
                            centerId: customer.centerId || session.centerId,
                            sessionId: session.id,
                            sessionCode: session.sessionCode,
                            milkCategory,
                            quantityLiters: rawWeight,
                            fatPercentage: rawFat,
                            snfPercentage: rawSnf,
                            appliedRate: rateValidation.authoritativeRate,
                            totalAmount: rateValidation.authoritativeTotal,
                            farmerCode: customer.farmerCode,
                            farmerMaskedName: `${customer.fullName?.charAt(0) || 'F'}***`,
                            isIdempotentReplay: atomicResult.isIdempotentReplay,
                            status: atomicResult.isIdempotentReplay ? 'REPLAYED' : 'ACCEPTED',
                        },
                    });
                }
                catch { }
            }
            catch (itemErr) {
                if (itemErr.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
                        errorMessage: itemErr.message || 'Idempotency key was previously used for a different transaction payload',
                    });
                }
                else {
                    results.push({
                        clientIntakeUuid,
                        idempotencyKey,
                        status: 'REJECTED',
                        isIdempotentReplay: false,
                        errorCode: 'TRANSACTION_PROCESSING_ERROR',
                        errorMessage: itemErr.message || 'Failed to process transaction atomically',
                    });
                }
            }
        }
        const summary = {
            received: transactions.length,
            accepted: results.filter((r) => r.status === 'ACCEPTED').length,
            replayed: results.filter((r) => r.status === 'REPLAYED').length,
            rejected: results.filter((r) => r.status === 'REJECTED').length,
            retryable: results.filter((r) => r.status === 'RETRYABLE').length,
        };
        return {
            batchId: batch.batchId || crypto.randomUUID(),
            requestId,
            summary,
            results,
        };
    }
}
//# sourceMappingURL=BulkCollectionSyncUseCase.js.map