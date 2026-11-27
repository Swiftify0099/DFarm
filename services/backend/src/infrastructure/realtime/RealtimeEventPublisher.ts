import { Response } from 'express';
import crypto from 'node:crypto';
import pg from 'pg';
import { db } from '../database/PostgresPool.js';
import { tenantDbManager } from '../database/TenantDatabaseManager.js';
import { logger } from '../../shared/logger/index.js';

export type DashboardEventType =
  | 'COLLECTION_ACCEPTED'
  | 'COLLECTION_SYNCED'
  | 'COLLECTION_REJECTED'
  | 'COLLECTION_MANUAL_REVIEW'
  | 'SESSION_OPENED'
  | 'SESSION_CLOSED'
  | 'STATION_HEARTBEAT'
  | 'STATION_STATUS_CHANGED'
  | 'DEVICE_BLOCKED'
  | 'DEVICE_REVOKED';

export interface DashboardEvent {
  eventId: string;
  eventType: DashboardEventType;
  schemaVersion: number;
  organizationId: string;
  centerId?: string | null;
  entityId: string;
  aggregateVersion: number;
  occurredAt: string;
  publishedAt: string;
  payload: Record<string, any>;
}

interface SseClient {
  id: string;
  organizationId: string;
  centerId?: string | null;
  res: Response;
  connectedAt: Date;
}

export class RealtimeEventPublisher {
  private static instance: RealtimeEventPublisher;
  private clients: Map<string, SseClient> = new Map();
  // Bounded ring buffer of recent events per organization for fast in-memory replay
  private eventRingBuffer: DashboardEvent[] = [];
  private maxRingBufferSize = 500;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private outboxWorkerInterval: NodeJS.Timeout | null = null;
  private retentionCleanupInterval: NodeJS.Timeout | null = null;
  private isProcessingOutbox = false;
  private isDestroyed = false;
  private destroyPromise: Promise<void> | null = null;
  private readonly inFlightBackgroundWork = new Set<Promise<unknown>>();
  private lastCrossInstanceSyncTime: Date = new Date(Date.now() - 30000);

  private constructor() {
    // 1. Send lightweight SSE heartbeat comment every 20 seconds to prevent proxy / Cloudflare timeouts
    this.heartbeatInterval = setInterval(() => {
      if (this.isDestroyed) return;
      this.sendKeepAlivePing();
    }, 20000);
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }

    // 2. Start transactional outbox dispatch worker (multi-instance safe with FOR UPDATE SKIP LOCKED)
    this.outboxWorkerInterval = setInterval(() => {
      if (this.isDestroyed) return;
      this.processOutboxBatch().catch((err) => {
        logger.debug({ err: err?.message }, '[Outbox Worker] Tick encountered error');
      });
    }, 1000);
    if (this.outboxWorkerInterval.unref) {
      this.outboxWorkerInterval.unref();
    }

    // 3. Periodic safe outbox retention cleanup (every 1 hour)
    this.retentionCleanupInterval = setInterval(() => {
      if (this.isDestroyed) return;
      this.purgeOldOutboxEvents(7, 500).catch(() => {});
    }, 3600000);
    if (this.retentionCleanupInterval.unref) {
      this.retentionCleanupInterval.unref();
    }
  }

  private trackBackgroundWork<T>(promise: Promise<T>): Promise<T> {
    this.inFlightBackgroundWork.add(promise);
    const cleanup = () => {
      this.inFlightBackgroundWork.delete(promise);
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  public getInFlightBackgroundWorkCount(): number {
    return this.inFlightBackgroundWork.size;
  }

  public static getInstance(): RealtimeEventPublisher {
    if (!RealtimeEventPublisher.instance) {
      RealtimeEventPublisher.instance = new RealtimeEventPublisher();
    }
    return RealtimeEventPublisher.instance;
  }

  /**
   * Registers an active SSE client stream.
   * Handles tenant filtering, optional center filtering, initial watermark, and cleanup on disconnect.
   */
  public registerClient(params: {
    organizationId: string;
    centerId?: string | null;
    res: Response;
    lastEventId?: string;
  }): { clientId: string; unregister: () => void } {
    const clientId = crypto.randomUUID();
    const client: SseClient = {
      id: clientId,
      organizationId: params.organizationId,
      centerId: params.centerId || null,
      res: params.res,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);
    logger.info(
      { clientId, orgId: params.organizationId, centerId: params.centerId, totalClients: this.clients.size },
      '[SSE] Dairy admin realtime subscriber connected'
    );

    // Write initial connected handshake with watermark
    const watermarkEvent: DashboardEvent = {
      eventId: `EVT-INIT-${clientId}`,
      eventType: 'STATION_STATUS_CHANGED' as any,
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
        logger.warn({ err: err?.message, clientId }, '[SSE] Failed to replay missed events');
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
  public disconnectAllClients(): void {
    for (const [, client] of this.clients.entries()) {
      try {
        client.res.destroy();
      } catch {}
    }
    this.clients.clear();
  }

  /**
   * Publishes an event transactionally within a PostgreSQL transaction.
   * Inserts the outbox record inside the caller's active transaction client.
   * The Outbox Worker or post-commit broadcast picks it up for delivery.
   */
  public async publishWithTransaction(
    client: pg.PoolClient,
    eventData: {
      eventId?: string;
      eventType: DashboardEventType;
      organizationId: string;
      centerId?: string | null;
      entityId: string;
      payload: Record<string, any>;
      aggregateVersion?: number;
      occurredAt?: string;
    }
  ): Promise<DashboardEvent> {
    const eventId = eventData.eventId || `EVT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const occurredAt = eventData.occurredAt || new Date().toISOString();
    const aggregateVersion = eventData.aggregateVersion || 1;

    // Strict PII sanitization before recording
    const sanitizedPayload = this.sanitizePayload(eventData.payload);

    // 1. Insert into transactional outbox with PENDING status
    await client.query(
      `INSERT INTO dashboard_events_outbox (
        event_id, event_type, schema_version, organization_id, center_id,
        entity_id, aggregate_version, occurred_at, status, payload
      ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'PENDING', $8)
      ON CONFLICT (event_id) DO NOTHING;`,
      [
        eventId,
        eventData.eventType,
        eventData.organizationId,
        eventData.centerId || null,
        eventData.entityId,
        aggregateVersion,
        occurredAt,
        JSON.stringify(sanitizedPayload),
      ]
    );

    const event: DashboardEvent = {
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
   * Also ensures outbox record is persisted and marked PUBLISHED for audit and replay.
   */
  public broadcast(event: DashboardEvent): void {
    // 1. Append to bounded ring buffer for fast in-memory replay
    if (!this.eventRingBuffer.some((e) => e.eventId === event.eventId)) {
      this.eventRingBuffer.push(event);
      if (this.eventRingBuffer.length > this.maxRingBufferSize) {
        this.eventRingBuffer.shift();
      }
    }

    // 2. Persist / update outbox status as PUBLISHED asynchronously
    if (!this.isDestroyed) {
      this.persistOutboxEvent(event).catch(() => {});
    }

    // 3. Dispatch to matching connected local SSE clients
    this.dispatchToClients(event);
  }

  /**
   * Internal helper to dispatch an event to local connected SSE subscribers.
   */
  private dispatchToClients(event: DashboardEvent): void {
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
      } catch (err) {
        logger.warn({ clientId, err }, '[SSE] Error writing frame to client, removing');
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Transactional Outbox Batch Worker.
   * Executes periodically to process committed PENDING outbox events using FOR UPDATE SKIP LOCKED.
   * Multi-instance safe: multiple backend nodes never lock or double-process the same outbox row.
   */
  public async processOutboxBatch(): Promise<number> {
    if (this.isDestroyed || this.isProcessingOutbox) return 0;
    this.isProcessingOutbox = true;

    const batchPromise = (async () => {
      try {
        // 1. Fetch pending events with FOR UPDATE SKIP LOCKED
        const res = await db.query(
          `SELECT id, event_id, event_type, schema_version, organization_id, center_id,
                  entity_id, aggregate_version, occurred_at, payload
           FROM dashboard_events_outbox
           WHERE status = 'PENDING'
           ORDER BY created_at ASC
           LIMIT 50
           FOR UPDATE SKIP LOCKED;`
        );

        if (res.rows && res.rows.length > 0) {
          const publishedIds: string[] = [];

          for (const row of res.rows) {
            const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
            const event: DashboardEvent = {
              eventId: row.event_id,
              eventType: row.event_type,
              schemaVersion: row.schema_version,
              organizationId: row.organization_id,
              centerId: row.center_id,
              entityId: row.entity_id,
              aggregateVersion: Number(row.aggregate_version || 1),
              occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
              publishedAt: new Date().toISOString(),
              payload,
            };

            // Append to ring buffer
            if (!this.eventRingBuffer.some((e) => e.eventId === event.eventId)) {
              this.eventRingBuffer.push(event);
              if (this.eventRingBuffer.length > this.maxRingBufferSize) {
                this.eventRingBuffer.shift();
              }
            }

            // Dispatch to connected SSE subscribers
            this.dispatchToClients(event);
            publishedIds.push(row.id);
          }

          // Mark processed events as PUBLISHED
          if (publishedIds.length > 0) {
            await db.query(
              `UPDATE dashboard_events_outbox
               SET status = 'PUBLISHED', published_at = NOW()
               WHERE id = ANY($1::uuid[]);`,
              [publishedIds]
            );
          }

          return res.rows.length;
        }

        if (this.isDestroyed) {
          return 0;
        }

        // 2. Multi-instance cross-instance sync: check for events published by other instances
        if (this.clients.size > 0) {
          const lookbackTime = new Date(this.lastCrossInstanceSyncTime.getTime() - 5000);
          const crossRes = await db.query(
            `SELECT event_id, event_type, schema_version, organization_id, center_id,
                    entity_id, aggregate_version, occurred_at, published_at, payload, created_at
             FROM dashboard_events_outbox
             WHERE status = 'PUBLISHED'
               AND created_at >= $1
             ORDER BY created_at ASC
             LIMIT 100;`,
            [lookbackTime]
          );

          if (crossRes.rows && crossRes.rows.length > 0) {
            for (const row of crossRes.rows) {
              const rowCreatedAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
              if (rowCreatedAt > this.lastCrossInstanceSyncTime) {
                this.lastCrossInstanceSyncTime = rowCreatedAt;
              }

              // Only broadcast if not already dispatched locally
              if (!this.eventRingBuffer.some((e) => e.eventId === row.event_id)) {
                const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                const event: DashboardEvent = {
                  eventId: row.event_id,
                  eventType: row.event_type,
                  schemaVersion: row.schema_version,
                  organizationId: row.organization_id,
                  centerId: row.center_id,
                  entityId: row.entity_id,
                  aggregateVersion: Number(row.aggregate_version || 1),
                  occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
                  publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at || new Date().toISOString()),
                  payload,
                };

                this.eventRingBuffer.push(event);
                if (this.eventRingBuffer.length > this.maxRingBufferSize) {
                  this.eventRingBuffer.shift();
                }

                this.dispatchToClients(event);
              }
            }
          }
        }

        return 0;
      } catch (err: any) {
        logger.debug({ err: err?.message }, '[Outbox Worker] processOutboxBatch failed');
        return 0;
      } finally {
        this.isProcessingOutbox = false;
      }
    })();

    return this.trackBackgroundWork(batchPromise);
  }

  /**
   * Helper to write a single formatted SSE frame:
   * id: <eventId>\n
   * event: <eventType>\n
   * data: <JSON>\n\n
   */
  private sendSseFrame(res: Response, eventName: string, data: any): void {
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
  private sendKeepAlivePing(): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.res.writableEnded || client.res.destroyed) {
        this.clients.delete(clientId);
        continue;
      }
      try {
        client.res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      } catch {
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Replays missed events since Last-Event-ID for reconnecting clients.
   * Uses in-memory ring buffer first, then falls back to durable PostgreSQL outbox.
   * If cursor is expired or missing, notifies client to perform an authoritative REST snapshot refresh.
   */
  private async replayMissedEvents(client: SseClient, lastEventId: string): Promise<void> {
    if (this.isDestroyed) return;

    const replayPromise = (async () => {
      // 1. Check ring buffer first for immediate in-memory replay
      const ringIdx = this.eventRingBuffer.findIndex((e) => e.eventId === lastEventId);
      let missedEvents: DashboardEvent[] = [];

      if (ringIdx >= 0) {
        missedEvents = this.eventRingBuffer.slice(ringIdx + 1).filter((e) => {
          if (e.organizationId !== client.organizationId) return false;
          if (client.centerId && e.centerId && client.centerId !== e.centerId) return false;
          return true;
        });
      } else {
        // 2. Fallback: Query PostgreSQL durable outbox table
        try {
          const pool = await tenantDbManager.getTenantDb(client.organizationId);
          if (this.isDestroyed) return;

          // Verify that the requested cursor exists for this organization
          const cursorCheck = await pool.query(
            `SELECT created_at FROM dashboard_events_outbox
             WHERE event_id = $1 AND organization_id = $2
             LIMIT 1;`,
            [lastEventId, client.organizationId]
          );

          if (this.isDestroyed) return;

          if (cursorCheck.rows.length === 0) {
            // Cursor event does not exist in outbox (e.g. invalid or purged beyond retention)
            this.sendSseFrame(client.res, 'RESYNC_REQUIRED', {
              reason: 'CURSOR_EXPIRED',
              message: 'Historical event stream cursor expired or not found. Authoritative snapshot reload required.',
            });
            return;
          }

          const cursorCreatedAt = cursorCheck.rows[0].created_at;

          // Fetch events committed after the cursor
          const res = await pool.query(
            `SELECT event_id, event_type, schema_version, organization_id, center_id,
                    entity_id, aggregate_version, occurred_at, published_at, payload
             FROM dashboard_events_outbox
             WHERE organization_id = $1
               AND created_at > $2
             ORDER BY created_at ASC
             LIMIT 100;`,
            [client.organizationId, cursorCreatedAt]
          );

          if (this.isDestroyed) return;

          missedEvents = res.rows
            .filter((r: any) => !client.centerId || !r.center_id || client.centerId === r.center_id)
            .map((r: any) => ({
              eventId: r.event_id,
              eventType: r.event_type,
              schemaVersion: r.schema_version,
              organizationId: r.organization_id,
              centerId: r.center_id,
              entityId: r.entity_id,
              aggregateVersion: Number(r.aggregate_version || 1),
              occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
              publishedAt: r.published_at instanceof Date ? r.published_at.toISOString() : String(r.published_at || new Date().toISOString()),
              payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
            }));
        } catch {
          if (this.isDestroyed) return;
          // If outbox query fails, notify client to do a full snapshot refresh
          this.sendSseFrame(client.res, 'RESYNC_REQUIRED', {
            reason: 'CURSOR_EXPIRED',
            message: 'Historical event stream cursor expired. Authoritative snapshot reload required.',
          });
          return;
        }
      }

      if (this.isDestroyed) return;

      for (const evt of missedEvents) {
        this.sendSseFrame(client.res, evt.eventType, evt);
      }
    })();

    return this.trackBackgroundWork(replayPromise);
  }

  private async persistOutboxEvent(event: DashboardEvent): Promise<void> {
    if (this.isDestroyed) return;
    const persistPromise = (async () => {
      try {
        const sanitizedPayload = this.sanitizePayload(event.payload);
        await db.query(
          `INSERT INTO dashboard_events_outbox (
            event_id, event_type, schema_version, organization_id, center_id,
            entity_id, aggregate_version, occurred_at, status, published_at, payload
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PUBLISHED', NOW(), $9)
          ON CONFLICT (event_id) DO UPDATE
          SET status = 'PUBLISHED', published_at = NOW();`,
          [
            event.eventId,
            event.eventType,
            event.schemaVersion || 1,
            event.organizationId,
            event.centerId || null,
            event.entityId,
            event.aggregateVersion || 1,
            event.occurredAt || new Date().toISOString(),
            JSON.stringify(sanitizedPayload),
          ]
        );
      } catch {}
    })();

    return this.trackBackgroundWork(persistPromise);
  }

  /**
   * Strips sensitive farmer credentials, raw phone numbers, bank details, and secrets from payloads.
   */
  public sanitizePayload(payload: Record<string, any>): Record<string, any> {
    if (!payload || typeof payload !== 'object') return {};
    const sanitized: Record<string, any> = { ...payload };

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
   * Safe scheduled cleanup for old published outbox events.
   * - Retains at least the configured recovery window (default 7 days).
   * - Never deletes PENDING or FAILED events.
   * - Never deletes events currently claimed by a worker (FOR UPDATE SKIP LOCKED).
   * - Bounded batch size (500) prevents locking and table contention.
   * - Fully idempotent.
   */
  public async purgeOldOutboxEvents(retentionDays = 7, batchSize = 500): Promise<number> {
    if (this.isDestroyed) return 0;

    const purgePromise = (async () => {
      try {
        const res = await db.query(
          `WITH candidate_rows AS (
             SELECT id FROM dashboard_events_outbox
             WHERE status = 'PUBLISHED'
               AND published_at < NOW() - ($1 || ' days')::INTERVAL
             ORDER BY created_at ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           )
           DELETE FROM dashboard_events_outbox
           WHERE id IN (SELECT id FROM candidate_rows)
           RETURNING id;`,
          [retentionDays, batchSize]
        );
        const purgedCount = res.rowCount || (res.rows ? res.rows.length : 0);
        if (purgedCount > 0) {
          logger.info({ purgedCount, retentionDays }, '[RealtimeEventPublisher] Purged expired published outbox events');
        }
        return purgedCount;
      } catch (err: any) {
        logger.debug({ err: err?.message }, '[RealtimeEventPublisher] purgeOldOutboxEvents non-fatal notice');
        return 0;
      }
    })();

    return this.trackBackgroundWork(purgePromise);
  }

  public async destroy(): Promise<void> {
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
    })();

    return this.destroyPromise;
  }
}

export const realtimePublisher = RealtimeEventPublisher.getInstance();
