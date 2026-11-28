import { BadRequestError, NotFoundError, ForbiddenError, ConflictError, AppError, } from '../../shared/errors/app-error.js';
import { formatPaymentReceipt } from './payment-receipt-formatter.js';
import { getStrictPaymentTenantDb, resolveOperationalOrganizationId, } from './tenant-payment-context.js';
export class ReceiptService {
    async createReceipt(params, auth, targetOrganizationId) {
        if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== params.customerId) {
            throw new ForbiddenError('You can only create repayments for your own customer account', 'FORBIDDEN_CUSTOMER_ACCESS');
        }
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId ?? params.targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        try {
            return await tenantDb.withTransaction(async (client) => {
                try {
                    const res = await client.query(`SELECT public.create_customer_receipt(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            ) AS receipt;`, [
                        organizationId,
                        params.centerId,
                        params.customerId,
                        params.amount,
                        params.paymentMethod,
                        params.referenceNumber,
                        params.sourceTransactionType || 'DEBT_REPAYMENT',
                        params.sourceTransactionId || null,
                        params.idempotencyKey,
                        params.notes || null,
                        auth.userId,
                    ]);
                    return res.rows[0].receipt;
                }
                catch (err) {
                    if (err instanceof AppError)
                        throw err;
                    if (err.code === 'P0002') {
                        throw new NotFoundError(err.message, 'CUSTOMER_NOT_FOUND');
                    }
                    if (err.code === '23505' || err.message?.includes('duplicate key')) {
                        const existing = await client.query(`SELECT * FROM customer_receipts WHERE idempotency_key = $1 AND organization_id = $2;`, [params.idempotencyKey, organizationId]);
                        if (existing.rows.length > 0) {
                            const row = existing.rows[0];
                            return {
                                receiptId: row.id,
                                receiptNumber: row.receipt_number,
                                customerId: row.customer_id,
                                amount: Number(row.amount),
                                status: row.status,
                                isIdempotentReplay: true,
                            };
                        }
                        throw new ConflictError('A receipt with this idempotency key already exists', 'IDEMPOTENCY_CONFLICT');
                    }
                    throw new AppError(err.message, 500, 'RECEIPT_CREATION_FAILED');
                }
            });
        }
        catch (err) {
            if (err instanceof AppError)
                throw err;
            throw new AppError(err.message, 500, 'RECEIPT_CREATION_FAILED');
        }
    }
    async confirmReceipt(receiptId, auth, referenceNumber, targetOrganizationId) {
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        try {
            return await tenantDb.withTransaction(async (client) => {
                const lockRes = await client.query(`SELECT organization_id FROM customer_receipts WHERE id = $1 FOR UPDATE;`, [receiptId]);
                if (lockRes.rows.length === 0) {
                    throw new NotFoundError(`Receipt '${receiptId}' not found`, 'RECEIPT_NOT_FOUND');
                }
                if (lockRes.rows[0].organization_id !== organizationId) {
                    throw new ForbiddenError('Cross-organization access is strictly prohibited', 'CROSS_ORG_ACCESS_DENIED');
                }
                const res = await client.query('SELECT public.settle_customer_receipt($1, $2, $3) AS receipt;', [receiptId, auth.userId, referenceNumber || null]);
                const receipt = res.rows[0].receipt;
                const formatted = formatPaymentReceipt({
                    organizationName: receipt.organizationName || 'DFarm Cooperative',
                    centerName: receipt.centerName || 'Intake Center',
                    customerName: receipt.customerName,
                    farmerCode: receipt.farmerCode,
                    paymentId: receipt.receiptId,
                    receiptNumber: receipt.receiptNumber,
                    direction: 'CUSTOMER_PAYS_DAIRY',
                    amount: Number(receipt.amount),
                    currency: receipt.currency || 'INR',
                    paymentMethod: receipt.paymentMethod,
                    referenceNumber: receipt.referenceNumber,
                    status: receipt.status,
                    timestamp: receipt.settledAt,
                    authorizedActor: auth.authUser?.email || auth.authUser?.phone || auth.userId,
                    previousBalance: Number(receipt.previousBalance || 0),
                    balanceAfter: Number(receipt.customerBalanceAfter),
                });
                return {
                    ...receipt,
                    formattedReceipt: formatted,
                };
            });
        }
        catch (err) {
            if (err instanceof AppError)
                throw err;
            if (err.code === 'P0002') {
                throw new NotFoundError(err.message, 'RECEIPT_NOT_FOUND');
            }
            throw new BadRequestError(err.message, 'RECEIPT_CONFIRM_FAILED');
        }
    }
    async getReceiptById(receiptId, auth, targetOrganizationId) {
        const organizationId = resolveOperationalOrganizationId(auth, targetOrganizationId);
        const tenantDb = await getStrictPaymentTenantDb(organizationId);
        return tenantDb.withTransaction(async (client) => {
            const res = await client.query(`SELECT r.*, c.full_name as customer_name, c.farmer_code, dc.name as center_name, o.name as organization_name
         FROM customer_receipts r
         JOIN customers c ON c.id = r.customer_id
         JOIN dairy_centers dc ON dc.id = r.center_id
         JOIN organizations o ON o.id = r.organization_id
         WHERE r.id = $1;`, [receiptId]);
            if (res.rows.length === 0) {
                throw new NotFoundError(`Receipt '${receiptId}' not found`, 'RECEIPT_NOT_FOUND');
            }
            const row = res.rows[0];
            if (auth.actorType === 'CUSTOMER' && auth.customerProfile?.customerId !== row.customer_id) {
                throw new ForbiddenError('You can only access your own receipts', 'FORBIDDEN_CUSTOMER_ACCESS');
            }
            if (row.organization_id !== organizationId) {
                throw new ForbiddenError('Cross-organization access is strictly prohibited', 'CROSS_ORG_ACCESS_DENIED');
            }
            let balanceAfter = null;
            if (row.ledger_transaction_id) {
                const txnRes = await client.query('SELECT balance_after FROM ledger_transactions WHERE id = $1 AND organization_id = $2;', [row.ledger_transaction_id, organizationId]);
                if (txnRes.rows.length > 0) {
                    balanceAfter = Number(txnRes.rows[0].balance_after);
                }
            }
            const formatted = formatPaymentReceipt({
                organizationName: row.organization_name,
                centerName: row.center_name,
                customerName: row.customer_name,
                farmerCode: row.farmer_code,
                paymentId: row.id,
                receiptNumber: row.receipt_number,
                direction: 'CUSTOMER_PAYS_DAIRY',
                amount: Number(row.amount),
                currency: row.currency,
                paymentMethod: row.payment_method,
                referenceNumber: row.reference_number,
                status: row.status,
                timestamp: row.settled_at || row.created_at,
                authorizedActor: row.created_by,
                balanceAfter,
                notes: row.notes,
            });
            return {
                id: row.id,
                receiptNumber: row.receipt_number,
                organizationId: row.organization_id,
                organizationName: row.organization_name,
                centerId: row.center_id,
                centerName: row.center_name,
                customerId: row.customer_id,
                customerName: row.customer_name,
                farmerCode: row.farmer_code,
                direction: row.direction,
                amount: Number(row.amount),
                currency: row.currency,
                paymentMethod: row.payment_method,
                status: row.status,
                referenceNumber: row.reference_number,
                settledAt: row.settled_at,
                createdAt: row.created_at,
                formattedReceipt: formatted,
            };
        });
    }
}
export const receiptService = new ReceiptService();
//# sourceMappingURL=receipt.service.js.map