import crypto from 'node:crypto';
import { setTenantTransactionContext, tenantDbManager, TenantDatabaseUnavailableError, } from '../database/TenantDatabaseManager.js';
import { logger } from '../../shared/logger/index.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const OUTBOX_TENANT_DISCOVERY_PAGE_SIZE = 100;
const OUTBOX_TENANT_DISCOVERY_MAX_PAGES = 100;
const OUTBOX_TENANT_CONCURRENCY = 4;
const OUTBOX_PENDING_BATCH_SIZE = 50;
const OUTBOX_CROSS_SYNC_PAGE_SIZE = 100;
const OUTBOX_CROSS_SYNC_MAX_PAGES = 5;
const OUTBOX_CROSS_SYNC_LOOKBACK_MS = 30000;
const OUTBOX_CROSS_SYNC_OVERLAP_MS = 2000;
const MAX_RING_EVENTS_PER_TENANT = 500;
const MAX_TRACKED_TENANTS_IN_MEMORY = 250;
const MAX_RECENT_DISPATCHED_IDS_PER_TENANT = 1000;
const INVALID_MAPPING_STATUSES = new Set([
    'UNMAPPED',
    'INVALID_ORGANIZATION',
    'ORGANIZATION_INACTIVE',
    'CONTROL_PLANE_TARGET_FORBIDDEN',
    'DEPROVISIONING',
    'DEPROVISION_FAILED',
    'FAILED',
    'PENDING',
    'PROVISIONING',
    'DATABASE_CREATED',
    'MIGRATING',
    'VERIFYING',
    'RETRY_REQUIRED',
    'ORPHANED_RESOURCE',
    'CREDENTIALS_MISSING',
    'ISOLATED_TEST_INSTANCE_FORBIDDEN',
]);
/**
 * Tenant-scoped Transactional Outbox & SSE Realtime Event Publisher.
 *
 * Delivery guarantee:
 * - Implements safe **at-least-once delivery** per tenant database (`dashboard_events_outbox`)
 *   with stable `eventId` values and client-side consumer deduplication (`eventId` set).
 * - Worker ticks claim `PENDING` rows with `SELECT ... FOR UPDATE SKIP LOCKED` inside an active
 *   tenant PostgreSQL transaction bound to `app.current_organization_id`, dispatch to SSE clients,
 *   and mark `status = 'PUBLISHED', published_at = COALESCE(published_at, NOW())` on the same
 *   session/transaction before advancing memory ring buffers or updating `COMMIT`.
 * - Crashes or errors before `COMMIT` roll back cleanly, keeping committed rows `PENDING` for retry.
 */
export class RealtimeEventPublisher {
    static instance;
    clients = new Map();
    // Bounded per-organization ring buffer for fast, isolated in-memory Last-Event-ID replay
    tenantRingBuffers = new Map();
    // Bounded per-organization cross-instance sync cursor and recently-dispatched dedup IDs
    tenantSyncCursors = new Map();
    heartbeatInterval = null;
    outboxWorkerInterval = null;
    retentionCleanupInterval = null;
    isProcessingOutbox = false;
    isDestroyed = false;
    destroyPromise = null;
    inFlightBackgroundWork = new Set();
    totalBatchRuns = 0;
    totalFailedTenantBatches = 0;
    totalPersistenceFailures = 0;
    totalPurgeFailures = 0;
    lastBatchSummary = null;
    lastPurgeSummary = null;
    lastFailureByTenant = new Map();
    constructor() {
        // 1. Send lightweight SSE heartbeat comment every 20 seconds to prevent proxy / Cloudflare timeouts
        this.heartbeatInterval = setInterval(() => {
            if (this.isDestroyed)
                return;
            this.sendKeepAlivePing();
        }, 20000);
        if (this.heartbeatInterval.unref) {
            this.heartbeatInterval.unref();
        }
        // 2. Start transactional outbox dispatch worker (multi-instance safe with FOR UPDATE SKIP LOCKED)
        this.outboxWorkerInterval = setInterval(() => {
            if (this.isDestroyed)
                return;
            this.processOutboxBatch().catch((err) => {
                logger.warn({ operation: 'outboxWorkerInterval', err: err?.message }, '[Outbox Worker] Tick encountered error');
            });
        }, 1000);
        if (this.outboxWorkerInterval.unref) {
            this.outboxWorkerInterval.unref();
        }
        // 3. Periodic safe outbox retention cleanup (every 1 hour)
        this.retentionCleanupInterval = setInterval(() => {
            if (this.isDestroyed)
                return;
            this.purgeOldOutboxEvents(7, 500).catch((err) => {
                logger.warn({ operation: 'retentionCleanupInterval', err: err?.message }, '[Outbox Retention] Tick encountered error');
            });
        }, 3600000);
        if (this.retentionCleanupInterval.unref) {
            this.retentionCleanupInterval.unref();
        }
    }
    trackBackgroundWork(promise) {
        this.inFlightBackgroundWork.add(promise);
        const cleanup = () => {
            this.inFlightBackgroundWork.delete(promise);
        };
        promise.then(cleanup, cleanup);
        return promise;
    }
    getInFlightBackgroundWorkCount() {
        return this.inFlightBackgroundWork.size;
    }
    getObservabilitySnapshot() {
        const failures = {};
        for (const [orgId, details] of this.lastFailureByTenant.entries()) {
            failures[orgId] = { ...details };
        }
        return {
            totalBatchRuns: this.totalBatchRuns,
            totalFailedTenantBatches: this.totalFailedTenantBatches,
            totalPersistenceFailures: this.totalPersistenceFailures,
            totalPurgeFailures: this.totalPurgeFailures,
            lastBatchSummary: this.lastBatchSummary ? { ...this.lastBatchSummary, failures: [...this.lastBatchSummary.failures] } : null,
            lastPurgeSummary: this.lastPurgeSummary ? { ...this.lastPurgeSummary, failures: [...this.lastPurgeSummary.failures] } : null,
            lastFailureByTenant: failures,
        };
    }
    getLastOutboxBatchSummary() {
        return this.lastBatchSummary ? { ...this.lastBatchSummary, failures: [...this.lastBatchSummary.failures] } : null;
    }
    static getInstance() {
        if (!RealtimeEventPublisher.instance) {
            RealtimeEventPublisher.instance = new RealtimeEventPublisher();
        }
        return RealtimeEventPublisher.instance;
    }
    classifyOutboxError(err) {
        const message = String(err?.message || 'Unknown tenant outbox error');
        if (err instanceof TenantDatabaseUnavailableError) {
            const category = INVALID_MAPPING_STATUSES.has(err.status)
                ? 'INVALID_MAPPING'
                : 'TRANSIENT_UNAVAILABLE';
            return { category, code: err.code, status: err.status, message };
        }
        const code = typeof err?.code === 'string' ? err.code : undefined;
        if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === '57P01' || code === '57P03' || code === '08006') {
            return { category: 'TRANSIENT_UNAVAILABLE', code, message };
        }
        return { category: 'EXECUTION_ERROR', code, message };
    }
    recordTenantFailure(organizationId, operation, err) {
        const classified = this.classifyOutboxError(err);
        this.lastFailureByTenant.set(organizationId, {
            operation,
            ...classified,
            occurredAt: new Date().toISOString(),
        });
        if (this.lastFailureByTenant.size > MAX_TRACKED_TENANTS_IN_MEMORY) {
            const oldestKey = this.lastFailureByTenant.keys().next().value;
            if (oldestKey) {
                this.lastFailureByTenant.delete(oldestKey);
            }
        }
        return classified;
    }
    async resolveStrictTenantDb(organizationId) {
        const cleanOrgId = typeof organizationId === 'string' ? organizationId.trim() : '';
        if (!cleanOrgId || !UUID_REGEX.test(cleanOrgId) || tenantDbManager.isPlatformFederationDairy(cleanOrgId)) {
            throw new TenantDatabaseUnavailableError(cleanOrgId || 'UNKNOWN', 'INVALID_ORGANIZATION', 'Operational outbox operations require an active concrete tenant organization UUID');
        }
        return tenantDbManager.getStrictTenantDb(cleanOrgId, {
            bypassCache: true,
            strictOperational: true,
        });
    }
    async discoverActiveTenantsBounded() {
        const activeOrgIds = [];
        let afterDairyId = null;
        for (let page = 0; page < OUTBOX_TENANT_DISCOVERY_MAX_PAGES; page += 1) {
            if (this.isDestroyed)
                break;
            const batch = await tenantDbManager.listActiveTenantOrganizationIds({
                afterDairyId,
                limit: OUTBOX_TENANT_DISCOVERY_PAGE_SIZE,
            });
            if (!batch || batch.length === 0) {
                break;
            }
            for (const orgId of batch) {
                activeOrgIds.push(orgId);
            }
            if (batch.length < OUTBOX_TENANT_DISCOVERY_PAGE_SIZE) {
                break;
            }
            const lastId = batch[batch.length - 1];
            if (!lastId || lastId === afterDairyId) {
                break;
            }
            afterDairyId = lastId;
        }
        return activeOrgIds;
    }
    async runWithBoundedConcurrency(items, concurrency, worker) {
        if (items.length === 0)
            return [];
        const results = new Array(items.length);
        let nextIndex = 0;
        const workerCount = Math.min(concurrency, items.length);
        const runners = Array.from({ length: workerCount }, async () => {
            while (nextIndex < items.length) {
                if (this.isDestroyed)
                    return;
                const currentIndex = nextIndex;
                nextIndex += 1;
                results[currentIndex] = await worker(items[currentIndex]);
            }
        });
        await Promise.all(runners);
        return results;
    }
    evictOldestTenantStatesIfNeeded() {
        while (this.tenantRingBuffers.size > MAX_TRACKED_TENANTS_IN_MEMORY) {
            let oldestOrg = null;
            let oldestTime = Infinity;
            for (const [orgId, state] of this.tenantRingBuffers.entries()) {
                if (state.lastAccessedAt < oldestTime) {
                    oldestTime = state.lastAccessedAt;
                    oldestOrg = orgId;
                }
            }
            if (oldestOrg) {
                this.tenantRingBuffers.delete(oldestOrg);
            }
            else {
                break;
            }
        }
        while (this.tenantSyncCursors.size > MAX_TRACKED_TENANTS_IN_MEMORY) {
            let oldestOrg = null;
            let oldestTime = Infinity;
            for (const [orgId, cursor] of this.tenantSyncCursors.entries()) {
                if (cursor.lastAccessedAt < oldestTime) {
                    oldestTime = cursor.lastAccessedAt;
                    oldestOrg = orgId;
                }
            }
            if (oldestOrg) {
                this.tenantSyncCursors.delete(oldestOrg);
            }
            else {
                break;
            }
        }
    }
    getOrCreateTenantRingState(organizationId) {
        let state = this.tenantRingBuffers.get(organizationId);
        if (!state) {
            state = {
                events: [],
                eventIds: new Set(),
                lastAccessedAt: Date.now(),
            };
            this.tenantRingBuffers.set(organizationId, state);
            this.evictOldestTenantStatesIfNeeded();
        }
        else {
            state.lastAccessedAt = Date.now();
        }
        return state;
    }
    appendToTenantRingBuffer(event) {
        if (!event.organizationId)
            return;
        const state = this.getOrCreateTenantRingState(event.organizationId);
        if (state.eventIds.has(event.eventId)) {
            return;
        }
        state.events.push(event);
        state.eventIds.add(event.eventId);
        while (state.events.length > MAX_RING_EVENTS_PER_TENANT) {
            const removed = state.events.shift();
            if (removed) {
                state.eventIds.delete(removed.eventId);
            }
        }
    }
    getOrInitTenantSyncCursor(organizationId) {
        let cursor = this.tenantSyncCursors.get(organizationId);
        if (!cursor) {
            cursor = {
                publishedAt: new Date(Date.now() - OUTBOX_CROSS_SYNC_LOOKBACK_MS),
                recentDispatchedIds: new Set(),
                lastAccessedAt: Date.now(),
            };
            this.tenantSyncCursors.set(organizationId, cursor);
            this.evictOldestTenantStatesIfNeeded();
        }
        else {
            cursor.lastAccessedAt = Date.now();
        }
        return cursor;
    }
    markDispatchedLocally(organizationId, eventId) {
        const cursor = this.getOrInitTenantSyncCursor(organizationId);
        if (cursor.recentDispatchedIds.has(eventId)) {
            return;
        }
        cursor.recentDispatchedIds.add(eventId);
        while (cursor.recentDispatchedIds.size > MAX_RECENT_DISPATCHED_IDS_PER_TENANT) {
            const oldestId = cursor.recentDispatchedIds.values().next().value;
            if (oldestId) {
                cursor.recentDispatchedIds.delete(oldestId);
            }
            else {
                break;
            }
        }
    }
    hasBeenDispatchedLocally(organizationId, eventId) {
        const ringState = this.tenantRingBuffers.get(organizationId);
        if (ringState?.eventIds.has(eventId)) {
            return true;
        }
        const cursor = this.tenantSyncCursors.get(organizationId);
        return cursor ? cursor.recentDispatchedIds.has(eventId) : false;
    }
    hasConnectedClientsForTenant(organizationId) {
        for (const client of this.clients.values()) {
            if (client.organizationId === organizationId) {
                return true;
            }
        }
        return false;
    }
    mapOutboxRowToEvent(row, fallbackPublishedAt) {
        const rawPayload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        return {
            eventId: row.event_id,
            eventType: row.event_type,
            schemaVersion: Number(row.schema_version || 1),
            organizationId: row.organization_id,
            centerId: row.center_id || null,
            entityId: row.entity_id,
            aggregateVersion: Number(row.aggregate_version || 1),
            occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
            publishedAt: row.published_at instanceof Date
                ? row.published_at.toISOString()
                : (row.published_at ? String(row.published_at) : (fallbackPublishedAt || new Date().toISOString())),
            payload: this.sanitizePayload(rawPayload || {}),
        };
    }
    /**
     * Registers an active SSE client stream.
     * Handles tenant filtering, optional center filtering, initial watermark, and cleanup on disconnect.
     */
    registerClient(params) {
        const clientId = crypto.randomUUID();
        const client = {
            id: clientId,
            organizationId: params.organizationId,
            centerId: params.centerId || null,
            res: params.res,
            connectedAt: new Date(),
        };
        this.clients.set(clientId, client);
        logger.info({ clientId, orgId: params.organizationId, centerId: params.centerId, totalClients: this.clients.size }, '[SSE] Dairy admin realtime subscriber connected');
        // Write initial connected handshake with watermark
        const watermarkEvent = {
            eventId: `EVT-INIT-${clientId}`,
            eventType: 'STATION_STATUS_CHANGED',
            schemaVersion: 1,
            organizationId: params.organizationId,
            centerId: params.centerId,
            entityId: clientId,
            aggregateVersion: 1,
            occurredAt: new Date().toISOString(),
            publishedAt: new Date().toISOString(),
            payload: {
                type: 'CONNECTED',
                serverTime: new Date().toISOString(),
                clientId,
                organizationId: params.organizationId,
            },
        };
        this.sendSseFrame(params.res, 'CONNECTED', watermarkEvent);
        // Replay missed events if Last-Event-ID was supplied
        if (params.lastEventId && !this.isDestroyed) {
            this.replayMissedEvents(client, params.lastEventId).catch((err) => {
                logger.warn({ err: err?.message, clientId, organizationId: params.organizationId }, '[SSE] Failed to replay missed events');
            });
        }
        const unregister = () => {
            this.clients.delete(clientId);
            logger.info({ clientId, remaining: this.clients.size }, '[SSE] Client disconnected');
        };
        return { clientId, unregister };
    }
    /**
     * Forcibly closes all active client SSE sockets (used for connection drop simulation & teardown)
     */
    disconnectAllClients() {
        for (const [, client] of this.clients.entries()) {
            try {
                client.res.destroy();
            }
            catch { }
        }
        this.clients.clear();
    }
    /**
     * Publishes an event transactionally within a PostgreSQL transaction.
     * Inserts the outbox record inside the caller's active transaction client.
     * The Outbox Worker or post-commit broadcast picks it up for delivery.
     */
    async publishWithTransaction(client, eventData) {
        const eventId = eventData.eventId || `EVT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const occurredAt = eventData.occurredAt || new Date().toISOString();
        const aggregateVersion = eventData.aggregateVersion || 1;
        // Strict PII sanitization before recording
        const sanitizedPayload = this.sanitizePayload(eventData.payload);
        // Ensure transaction-local organization context matches the event's tenant for RLS
        await setTenantTransactionContext(client, eventData.organizationId);
        // 1. Insert into transactional outbox with PENDING status
        await client.query(`INSERT INTO dashboard_events_outbox (
        event_id, event_type, schema_version, organization_id, center_id,
        entity_id, aggregate_version, occurred_at, status, payload
      ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'PENDING', $8)
      ON CONFLICT (event_id) DO NOTHING;`, [
            eventId,
            eventData.eventType,
            eventData.organizationId,
            eventData.centerId || null,
            eventData.entityId,
            aggregateVersion,
            occurredAt,
            JSON.stringify(sanitizedPayload),
        ]);
        const event = {
            eventId,
            eventType: eventData.eventType,
            schemaVersion: 1,
            organizationId: eventData.organizationId,
            centerId: eventData.centerId || null,
            entityId: eventData.entityId,
            aggregateVersion,
            occurredAt,
            publishedAt: new Date().toISOString(),
            payload: sanitizedPayload,
        };
        return event;
    }
    /**
     * Broadcasts an event immediately to connected SSE subscribers.
     * Also persists/marks the outbox record PUBLISHED in the event's strict tenant DB for replay & cross-instance sync.
     */
    broadcast(event) {
        const sanitizedEvent = {
            ...event,
            payload: this.sanitizePayload(event.payload),
        };
        // 1. Append to tenant-isolated ring buffer and dedup set for fast local replay
        this.appendToTenantRingBuffer(sanitizedEvent);
        this.markDispatchedLocally(sanitizedEvent.organizationId, sanitizedEvent.eventId);
        // 2. Persist / update outbox status as PUBLISHED in the strict tenant DB asynchronously
        if (!this.isDestroyed) {
            this.persistOutboxEvent(sanitizedEvent).catch((err) => {
                logger.error({
                    organizationId: sanitizedEvent.organizationId,
                    eventId: sanitizedEvent.eventId,
                    eventType: sanitizedEvent.eventType,
                    operation: 'broadcast.persistOutboxEvent',
                    code: err?.code,
                    status: err?.status,
                    err: err?.message,
                }, '[RealtimeEventPublisher] Failed persisting broadcast event to tenant outbox');
            });
        }
        // 3. Dispatch to matching connected local SSE clients
        this.dispatchToClients(sanitizedEvent);
    }
    /**
     * Internal helper to dispatch an event to local connected SSE subscribers.
     */
    dispatchToClients(event) {
        for (const [clientId, client] of this.clients.entries()) {
            if (client.organizationId !== event.organizationId) {
                continue;
            }
            // If client is filtered by center, skip events belonging to other centers
            if (client.centerId && event.centerId && client.centerId !== event.centerId) {
                continue;
            }
            try {
                this.sendSseFrame(client.res, event.eventType, event);
            }
            catch (err) {
                logger.warn({ clientId, organizationId: event.organizationId, err }, '[SSE] Error writing frame to client, removing');
                this.clients.delete(clientId);
            }
        }
    }
    /**
     * Processes PENDING outbox rows and cross-instance PUBLISHED sync for one specific tenant organization.
     * Executes strictly inside the resolved tenant PostgreSQL database with transaction-local RLS context.
     */
    async processTenantOutboxBatch(organizationId) {
        if (this.isDestroyed) {
            return {
                organizationId,
                ok: true,
                pendingProcessed: 0,
                crossInstanceDispatched: 0,
            };
        }
        const runPromise = (async () => {
            let pendingProcessed = 0;
            let crossInstanceDispatched = 0;
            try {
                const tenantDb = await this.resolveStrictTenantDb(organizationId);
                if (this.isDestroyed) {
                    return { organizationId, ok: true, pendingProcessed: 0, crossInstanceDispatched: 0 };
                }
                // 1. Transactionally claim PENDING rows with FOR UPDATE SKIP LOCKED, dispatch, and mark PUBLISHED on same tx
                const committedEvents = [];
                await tenantDb.withTransaction(async (txClient) => {
                    await setTenantTransactionContext(txClient, organizationId);
                    const pendingRes = await txClient.query(`SELECT id, event_id, event_type, schema_version, organization_id, center_id,
                    entity_id, aggregate_version, occurred_at, created_at, payload
             FROM dashboard_events_outbox
             WHERE organization_id = $1
               AND status = 'PENDING'
             ORDER BY created_at ASC, id ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED;`, [organizationId, OUTBOX_PENDING_BATCH_SIZE]);
                    if (!pendingRes.rows || pendingRes.rows.length === 0) {
                        return;
                    }
                    const claimedIds = [];
                    const nowIso = new Date().toISOString();
                    for (const row of pendingRes.rows) {
                        const event = this.mapOutboxRowToEvent(row, nowIso);
                        this.dispatchToClients(event);
                        claimedIds.push(row.id);
                        committedEvents.push(event);
                    }
                    if (claimedIds.length > 0) {
                        await txClient.query(`UPDATE dashboard_events_outbox
               SET status = 'PUBLISHED',
                   published_at = COALESCE(published_at, NOW())
               WHERE organization_id = $1
                 AND id = ANY($2::uuid[]);`, [organizationId, claimedIds]);
                    }
                });
                // Update local memory ring buffer & dedup state ONLY after DB COMMIT succeeds
                for (const event of committedEvents) {
                    this.appendToTenantRingBuffer(event);
                    this.markDispatchedLocally(event.organizationId, event.eventId);
                }
                pendingProcessed = committedEvents.length;
                // 2. Per-tenant cross-instance synchronization for local connected SSE clients
                if (!this.isDestroyed && this.hasConnectedClientsForTenant(organizationId)) {
                    crossInstanceDispatched = await this.syncCrossInstancePublishedEvents(tenantDb, organizationId);
                }
                return {
                    organizationId,
                    ok: true,
                    pendingProcessed,
                    crossInstanceDispatched,
                };
            }
            catch (err) {
                const classified = this.recordTenantFailure(organizationId, 'processTenantOutboxBatch', err);
                logger.error({
                    organizationId,
                    operation: 'processTenantOutboxBatch',
                    category: classified.category,
                    code: classified.code,
                    status: classified.status,
                    err: classified.message,
                }, '[Outbox Worker] Tenant outbox batch failed');
                return {
                    organizationId,
                    ok: false,
                    pendingProcessed: 0,
                    crossInstanceDispatched: 0,
                    errorCategory: classified.category,
                    errorCode: classified.code,
                    errorStatus: classified.status,
                    errorMessage: classified.message,
                };
            }
        })();
        return this.trackBackgroundWork(runPromise);
    }
    async syncCrossInstancePublishedEvents(tenantDb, organizationId) {
        const cursor = this.getOrInitTenantSyncCursor(organizationId);
        const lookbackFloor = new Date(cursor.publishedAt.getTime() - OUTBOX_CROSS_SYNC_OVERLAP_MS);
        let pagePublishedAt = lookbackFloor;
        let pageRowId = NIL_UUID;
        let dispatchedCount = 0;
        const committedPublishedEvents = [];
        await tenantDb.withTransaction(async (txClient) => {
            await setTenantTransactionContext(txClient, organizationId);
            for (let page = 0; page < OUTBOX_CROSS_SYNC_MAX_PAGES; page += 1) {
                if (this.isDestroyed)
                    break;
                const crossRes = await txClient.query(`SELECT id, event_id, event_type, schema_version, organization_id, center_id,
                  entity_id, aggregate_version, occurred_at, published_at, created_at, payload
           FROM dashboard_events_outbox
           WHERE organization_id = $1
             AND status = 'PUBLISHED'
             AND COALESCE(published_at, created_at) >= $2
             AND (
               COALESCE(published_at, created_at) > $3
               OR (COALESCE(published_at, created_at) = $3 AND id > $4::uuid)
             )
           ORDER BY COALESCE(published_at, created_at) ASC, id ASC
           LIMIT $5;`, [organizationId, lookbackFloor, pagePublishedAt, pageRowId, OUTBOX_CROSS_SYNC_PAGE_SIZE]);
                if (!crossRes.rows || crossRes.rows.length === 0) {
                    break;
                }
                for (const row of crossRes.rows) {
                    const rawPub = row.published_at || row.created_at;
                    const rowPubDate = rawPub instanceof Date ? rawPub : new Date(rawPub);
                    pagePublishedAt = rowPubDate;
                    pageRowId = row.id;
                    const event = this.mapOutboxRowToEvent(row);
                    committedPublishedEvents.push({ event, effectivePubDate: rowPubDate });
                }
                if (crossRes.rows.length < OUTBOX_CROSS_SYNC_PAGE_SIZE) {
                    break;
                }
            }
        });
        for (const item of committedPublishedEvents) {
            if (item.effectivePubDate > cursor.publishedAt) {
                cursor.publishedAt = item.effectivePubDate;
            }
            if (!this.hasBeenDispatchedLocally(organizationId, item.event.eventId)) {
                this.appendToTenantRingBuffer(item.event);
                this.markDispatchedLocally(organizationId, item.event.eventId);
                this.dispatchToClients(item.event);
                dispatchedCount += 1;
            }
        }
        return dispatchedCount;
    }
    /**
     * Transactional Outbox Batch Worker with full observability summary.
     * Discovers active tenants from central mapping table using bounded pagination and processes
     * each tenant strictly in its own tenant PostgreSQL database with bounded concurrency.
     */
    async processOutboxBatchDetailed() {
        const startedAt = new Date().toISOString();
        if (this.isDestroyed || this.isProcessingOutbox) {
            return {
                startedAt,
                completedAt: new Date().toISOString(),
                tenantsAttempted: 0,
                tenantsSucceeded: 0,
                tenantsFailed: 0,
                pendingProcessed: 0,
                crossInstanceDispatched: 0,
                controlPlaneDiscoveryFailed: false,
                failures: [],
            };
        }
        this.isProcessingOutbox = true;
        const batchPromise = (async () => {
            try {
                this.totalBatchRuns += 1;
                let activeOrgIds = [];
                try {
                    activeOrgIds = await this.discoverActiveTenantsBounded();
                }
                catch (discoveryErr) {
                    const message = String(discoveryErr?.message || 'Control plane tenant discovery failed');
                    logger.error({
                        operation: 'processOutboxBatch.discoverActiveTenants',
                        code: discoveryErr?.code,
                        err: message,
                    }, '[Outbox Worker] Failed discovering active tenant organizations');
                    const summary = {
                        startedAt,
                        completedAt: new Date().toISOString(),
                        tenantsAttempted: 0,
                        tenantsSucceeded: 0,
                        tenantsFailed: 1,
                        pendingProcessed: 0,
                        crossInstanceDispatched: 0,
                        controlPlaneDiscoveryFailed: true,
                        controlPlaneError: message,
                        failures: [],
                    };
                    this.lastBatchSummary = summary;
                    return summary;
                }
                if (this.isDestroyed || activeOrgIds.length === 0) {
                    const summary = {
                        startedAt,
                        completedAt: new Date().toISOString(),
                        tenantsAttempted: 0,
                        tenantsSucceeded: 0,
                        tenantsFailed: 0,
                        pendingProcessed: 0,
                        crossInstanceDispatched: 0,
                        controlPlaneDiscoveryFailed: false,
                        failures: [],
                    };
                    this.lastBatchSummary = summary;
                    return summary;
                }
                const results = await this.runWithBoundedConcurrency(activeOrgIds, OUTBOX_TENANT_CONCURRENCY, (orgId) => this.processTenantOutboxBatch(orgId));
                const executedResults = results.filter((r) => Boolean(r));
                const failures = executedResults.filter((r) => !r.ok);
                const pendingProcessed = executedResults.reduce((sum, r) => sum + r.pendingProcessed, 0);
                const crossInstanceDispatched = executedResults.reduce((sum, r) => sum + r.crossInstanceDispatched, 0);
                this.totalFailedTenantBatches += failures.length;
                const summary = {
                    startedAt,
                    completedAt: new Date().toISOString(),
                    tenantsAttempted: executedResults.length,
                    tenantsSucceeded: executedResults.length - failures.length,
                    tenantsFailed: failures.length,
                    pendingProcessed,
                    crossInstanceDispatched,
                    controlPlaneDiscoveryFailed: false,
                    failures,
                };
                this.lastBatchSummary = summary;
                return summary;
            }
            finally {
                this.isProcessingOutbox = false;
            }
        })();
        return this.trackBackgroundWork(batchPromise);
    }
    /**
     * Backward-compatible batch worker entrypoint returning total PENDING events published across active tenants.
     */
    async processOutboxBatch() {
        const summary = await this.processOutboxBatchDetailed();
        return summary.pendingProcessed;
    }
    /**
     * Helper to write a single formatted SSE frame:
     * id: <eventId>\n
     * event: <eventType>\n
     * data: <JSON>\n\n
     */
    sendSseFrame(res, eventName, data) {
        if (res.writableEnded || res.destroyed) {
            return;
        }
        const eventId = data?.eventId || crypto.randomUUID();
        res.write(`id: ${eventId}\n`);
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
    /**
     * Sends heartbeat keep-alive comment frames to all clients to prevent proxy timeouts.
     */
    sendKeepAlivePing() {
        for (const [clientId, client] of this.clients.entries()) {
            if (client.res.writableEnded || client.res.destroyed) {
                this.clients.delete(clientId);
                continue;
            }
            try {
                client.res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
            }
            catch {
                this.clients.delete(clientId);
            }
        }
    }
    /**
     * Replays missed events since Last-Event-ID for reconnecting clients.
     * Uses tenant-isolated in-memory ring buffer first, then falls back strictly to that tenant's
     * durable PostgreSQL outbox. Missing, invalid, or cross-tenant cursors emit RESYNC_REQUIRED.
     */
    async replayMissedEvents(client, lastEventId) {
        if (this.isDestroyed)
            return;
        const replayPromise = (async () => {
            // 1. Check tenant-isolated ring buffer first for immediate in-memory replay
            const ringState = this.tenantRingBuffers.get(client.organizationId);
            const ringIdx = ringState ? ringState.events.findIndex((e) => e.eventId === lastEventId) : -1;
            let missedEvents = [];
            if (ringIdx >= 0 && ringState) {
                ringState.lastAccessedAt = Date.now();
                missedEvents = ringState.events.slice(ringIdx + 1).filter((e) => {
                    if (e.organizationId !== client.organizationId)
                        return false;
                    if (client.centerId && e.centerId && client.centerId !== e.centerId)
                        return false;
                    return true;
                });
            }
            else {
                // 2. Fallback: Query THIS tenant's durable outbox via strict tenant resolution
                try {
                    const tenantDb = await this.resolveStrictTenantDb(client.organizationId);
                    if (this.isDestroyed)
                        return;
                    const replayRows = await tenantDb.withTransaction(async (txClient) => {
                        await setTenantTransactionContext(txClient, client.organizationId);
                        // Verify that the requested cursor exists for THIS organization
                        const cursorCheck = await txClient.query(`SELECT id, created_at
               FROM dashboard_events_outbox
               WHERE event_id = $1 AND organization_id = $2
               LIMIT 1;`, [lastEventId, client.organizationId]);
                        if (cursorCheck.rows.length === 0) {
                            return null;
                        }
                        const cursorRowId = cursorCheck.rows[0].id;
                        const cursorCreatedAt = cursorCheck.rows[0].created_at;
                        const sql = client.centerId
                            ? `SELECT id, event_id, event_type, schema_version, organization_id, center_id,
                        entity_id, aggregate_version, occurred_at, published_at, created_at, payload
                 FROM dashboard_events_outbox
                 WHERE organization_id = $1
                   AND status <> 'FAILED'
                   AND (
                     created_at > $2
                     OR (created_at = $2 AND id > $3::uuid)
                   )
                   AND (center_id IS NULL OR center_id = $4::uuid)
                 ORDER BY created_at ASC, id ASC
                 LIMIT 100;`
                            : `SELECT id, event_id, event_type, schema_version, organization_id, center_id,
                        entity_id, aggregate_version, occurred_at, published_at, created_at, payload
                 FROM dashboard_events_outbox
                 WHERE organization_id = $1
                   AND status <> 'FAILED'
                   AND (
                     created_at > $2
                     OR (created_at = $2 AND id > $3::uuid)
                   )
                 ORDER BY created_at ASC, id ASC
                 LIMIT 100;`;
                        const queryParams = client.centerId
                            ? [client.organizationId, cursorCreatedAt, cursorRowId, client.centerId]
                            : [client.organizationId, cursorCreatedAt, cursorRowId];
                        const res = await txClient.query(sql, queryParams);
                        return res.rows;
                    });
                    if (this.isDestroyed)
                        return;
                    if (replayRows === null) {
                        this.sendSseFrame(client.res, 'RESYNC_REQUIRED', {
                            reason: 'CURSOR_EXPIRED',
                            message: 'Historical event stream cursor expired or not found. Authoritative snapshot reload required.',
                        });
                        return;
                    }
                    missedEvents = replayRows
                        .filter((r) => !client.centerId || !r.center_id || client.centerId === r.center_id)
                        .map((r) => this.mapOutboxRowToEvent(r));
                }
                catch (err) {
                    if (this.isDestroyed)
                        return;
                    const classified = this.recordTenantFailure(client.organizationId, 'replayMissedEvents', err);
                    logger.warn({
                        organizationId: client.organizationId,
                        operation: 'replayMissedEvents',
                        category: classified.category,
                        code: classified.code,
                        status: classified.status,
                        err: classified.message,
                    }, '[SSE] Replay query failed; signaling RESYNC_REQUIRED');
                    this.sendSseFrame(client.res, 'RESYNC_REQUIRED', {
                        reason: 'CURSOR_EXPIRED',
                        message: 'Historical event stream cursor expired. Authoritative snapshot reload required.',
                    });
                    return;
                }
            }
            if (this.isDestroyed)
                return;
            for (const evt of missedEvents) {
                this.markDispatchedLocally(client.organizationId, evt.eventId);
                this.sendSseFrame(client.res, evt.eventType, evt);
            }
        })();
        return this.trackBackgroundWork(replayPromise);
    }
    /**
     * Persists a direct event to the target organization's strict tenant outbox database.
     * Uses ON CONFLICT (event_id) DO UPDATE preserving existing event identity/payload while transitioning PUBLISHED.
     * Fails loudly on invalid mapping or database errors so callers/telemetry observe every failure.
     */
    async persistOutboxEvent(event) {
        if (this.isDestroyed)
            return;
        const persistPromise = (async () => {
            try {
                const sanitizedPayload = this.sanitizePayload(event.payload);
                const tenantDb = await this.resolveStrictTenantDb(event.organizationId);
                if (this.isDestroyed)
                    return;
                await tenantDb.withTransaction(async (txClient) => {
                    await setTenantTransactionContext(txClient, event.organizationId);
                    await txClient.query(`INSERT INTO dashboard_events_outbox (
              event_id, event_type, schema_version, organization_id, center_id,
              entity_id, aggregate_version, occurred_at, status, published_at, payload
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PUBLISHED', NOW(), $9)
            ON CONFLICT (event_id) DO UPDATE
            SET status = 'PUBLISHED',
                published_at = COALESCE(dashboard_events_outbox.published_at, NOW())
            WHERE dashboard_events_outbox.organization_id = EXCLUDED.organization_id;`, [
                        event.eventId,
                        event.eventType,
                        event.schemaVersion || 1,
                        event.organizationId,
                        event.centerId || null,
                        event.entityId,
                        event.aggregateVersion || 1,
                        event.occurredAt || new Date().toISOString(),
                        JSON.stringify(sanitizedPayload),
                    ]);
                });
            }
            catch (err) {
                this.totalPersistenceFailures += 1;
                const classified = this.recordTenantFailure(event.organizationId || 'UNKNOWN', 'persistOutboxEvent', err);
                logger.error({
                    organizationId: event.organizationId,
                    eventId: event.eventId,
                    eventType: event.eventType,
                    operation: 'persistOutboxEvent',
                    category: classified.category,
                    code: classified.code,
                    status: classified.status,
                    err: classified.message,
                }, '[RealtimeEventPublisher] Outbox event persistence failed');
                throw err;
            }
        })();
        return this.trackBackgroundWork(persistPromise);
    }
    /**
     * Strips sensitive farmer credentials, raw phone numbers, bank details, and secrets from payloads.
     */
    sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object')
            return {};
        const sanitized = { ...payload };
        // Redact direct PII and secret fields
        delete sanitized.mobileNumber;
        delete sanitized.phoneNumber;
        delete sanitized.normalizedMobileNumber;
        delete sanitized.bankAccountNumber;
        delete sanitized.accountNumber;
        delete sanitized.ifscCode;
        delete sanitized.deviceToken;
        delete sanitized.tokenHash;
        delete sanitized.secret;
        delete sanitized.privateKey;
        delete sanitized.password;
        delete sanitized.pin;
        delete sanitized.token;
        delete sanitized.ticket;
        return sanitized;
    }
    /**
     * Tenant-scoped retention cleanup for old published outbox events for a single tenant.
     */
    async purgeTenantOldOutboxEvents(organizationId, retentionDays = 7, batchSize = 500) {
        if (this.isDestroyed) {
            return { organizationId, ok: true, purgedCount: 0 };
        }
        const safeRetentionDays = Math.max(1, Math.floor(retentionDays));
        const safeBatchSize = Math.min(2000, Math.max(1, Math.floor(batchSize)));
        const cutoffDate = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);
        const purgePromise = (async () => {
            try {
                const tenantDb = await this.resolveStrictTenantDb(organizationId);
                if (this.isDestroyed) {
                    return { organizationId, ok: true, purgedCount: 0 };
                }
                const purgedCount = await tenantDb.withTransaction(async (txClient) => {
                    await setTenantTransactionContext(txClient, organizationId);
                    const res = await txClient.query(`WITH candidate_rows AS (
               SELECT id
               FROM dashboard_events_outbox
               WHERE organization_id = $1
                 AND status = 'PUBLISHED'
                 AND published_at IS NOT NULL
                 AND published_at < $2
               ORDER BY created_at ASC, id ASC
               LIMIT $3
               FOR UPDATE SKIP LOCKED
             )
             DELETE FROM dashboard_events_outbox
             WHERE organization_id = $1
               AND id IN (SELECT id FROM candidate_rows)
             RETURNING id;`, [organizationId, cutoffDate, safeBatchSize]);
                    return res.rowCount || (res.rows ? res.rows.length : 0);
                });
                if (purgedCount > 0) {
                    logger.info({ organizationId, purgedCount, retentionDays: safeRetentionDays }, '[RealtimeEventPublisher] Purged expired published outbox events for tenant');
                }
                return {
                    organizationId,
                    ok: true,
                    purgedCount,
                };
            }
            catch (err) {
                this.totalPurgeFailures += 1;
                const classified = this.recordTenantFailure(organizationId, 'purgeOldOutboxEvents', err);
                logger.error({
                    organizationId,
                    operation: 'purgeOldOutboxEvents',
                    category: classified.category,
                    code: classified.code,
                    status: classified.status,
                    err: classified.message,
                }, '[RealtimeEventPublisher] Tenant outbox retention cleanup failed');
                return {
                    organizationId,
                    ok: false,
                    purgedCount: 0,
                    errorCategory: classified.category,
                    errorCode: classified.code,
                    errorStatus: classified.status,
                    errorMessage: classified.message,
                };
            }
        })();
        return this.trackBackgroundWork(purgePromise);
    }
    /**
     * Safe scheduled cleanup for old published outbox events across active tenants with full summary.
     * - Runs strictly per tenant database inside an explicit transaction with FOR UPDATE SKIP LOCKED.
     * - Never deletes PENDING or FAILED events, and isolates failures per tenant.
     */
    async purgeOldOutboxEventsDetailed(retentionDays = 7, batchSize = 500) {
        const startedAt = new Date().toISOString();
        const safeRetentionDays = Math.max(1, Math.floor(retentionDays));
        if (this.isDestroyed) {
            return {
                startedAt,
                completedAt: new Date().toISOString(),
                retentionDays: safeRetentionDays,
                tenantsAttempted: 0,
                tenantsSucceeded: 0,
                tenantsFailed: 0,
                totalPurged: 0,
                controlPlaneDiscoveryFailed: false,
                failures: [],
            };
        }
        const purgePromise = (async () => {
            let activeOrgIds = [];
            try {
                activeOrgIds = await this.discoverActiveTenantsBounded();
            }
            catch (err) {
                this.totalPurgeFailures += 1;
                const message = String(err?.message || 'Control plane tenant discovery failed during purge');
                logger.error({ operation: 'purgeOldOutboxEvents.discoverActiveTenants', code: err?.code, err: message }, '[RealtimeEventPublisher] Failed discovering active tenants for outbox retention cleanup');
                const summary = {
                    startedAt,
                    completedAt: new Date().toISOString(),
                    retentionDays: safeRetentionDays,
                    tenantsAttempted: 0,
                    tenantsSucceeded: 0,
                    tenantsFailed: 1,
                    totalPurged: 0,
                    controlPlaneDiscoveryFailed: true,
                    controlPlaneError: message,
                    failures: [],
                };
                this.lastPurgeSummary = summary;
                return summary;
            }
            const results = await this.runWithBoundedConcurrency(activeOrgIds, OUTBOX_TENANT_CONCURRENCY, (orgId) => this.purgeTenantOldOutboxEvents(orgId, safeRetentionDays, batchSize));
            const executed = results.filter((r) => Boolean(r));
            const failures = executed.filter((r) => !r.ok);
            const totalPurged = executed.reduce((sum, r) => sum + r.purgedCount, 0);
            const summary = {
                startedAt,
                completedAt: new Date().toISOString(),
                retentionDays: safeRetentionDays,
                tenantsAttempted: executed.length,
                tenantsSucceeded: executed.length - failures.length,
                tenantsFailed: failures.length,
                totalPurged,
                controlPlaneDiscoveryFailed: false,
                failures,
            };
            this.lastPurgeSummary = summary;
            return summary;
        })();
        return this.trackBackgroundWork(purgePromise);
    }
    /**
     * Backward-compatible cleanup entrypoint returning total purged events across active tenants.
     */
    async purgeOldOutboxEvents(retentionDays = 7, batchSize = 500) {
        const summary = await this.purgeOldOutboxEventsDetailed(retentionDays, batchSize);
        return summary.totalPurged;
    }
    async destroy() {
        if (this.destroyPromise) {
            return this.destroyPromise;
        }
        this.isDestroyed = true;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.outboxWorkerInterval) {
            clearInterval(this.outboxWorkerInterval);
            this.outboxWorkerInterval = null;
        }
        if (this.retentionCleanupInterval) {
            clearInterval(this.retentionCleanupInterval);
            this.retentionCleanupInterval = null;
        }
        this.destroyPromise = (async () => {
            this.disconnectAllClients();
            while (this.inFlightBackgroundWork.size > 0) {
                await Promise.allSettled(Array.from(this.inFlightBackgroundWork));
            }
            this.tenantRingBuffers.clear();
            this.tenantSyncCursors.clear();
        })();
        return this.destroyPromise;
    }
}
export const realtimePublisher = RealtimeEventPublisher.getInstance();
//# sourceMappingURL=RealtimeEventPublisher.js.map