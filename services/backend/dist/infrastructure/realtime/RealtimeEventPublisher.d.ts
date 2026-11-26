import { Response } from 'express';
import pg from 'pg';
export type DashboardEventType = 'COLLECTION_ACCEPTED' | 'COLLECTION_SYNCED' | 'COLLECTION_REJECTED' | 'COLLECTION_MANUAL_REVIEW' | 'SESSION_OPENED' | 'SESSION_CLOSED' | 'STATION_HEARTBEAT' | 'STATION_STATUS_CHANGED' | 'DEVICE_BLOCKED' | 'DEVICE_REVOKED';
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
export declare class RealtimeEventPublisher {
    private static instance;
    private clients;
    private eventRingBuffer;
    private maxRingBufferSize;
    private heartbeatInterval;
    private outboxWorkerInterval;
    private retentionCleanupInterval;
    private isProcessingOutbox;
    private lastCrossInstanceSyncTime;
    private constructor();
    static getInstance(): RealtimeEventPublisher;
    /**
     * Registers an active SSE client stream.
     * Handles tenant filtering, optional center filtering, initial watermark, and cleanup on disconnect.
     */
    registerClient(params: {
        organizationId: string;
        centerId?: string | null;
        res: Response;
        lastEventId?: string;
    }): {
        clientId: string;
        unregister: () => void;
    };
    /**
     * Forcibly closes all active client SSE sockets (used for connection drop simulation & teardown)
     */
    disconnectAllClients(): void;
    /**
     * Publishes an event transactionally within a PostgreSQL transaction.
     * Inserts the outbox record inside the caller's active transaction client.
     * The Outbox Worker or post-commit broadcast picks it up for delivery.
     */
    publishWithTransaction(client: pg.PoolClient, eventData: {
        eventId?: string;
        eventType: DashboardEventType;
        organizationId: string;
        centerId?: string | null;
        entityId: string;
        payload: Record<string, any>;
        aggregateVersion?: number;
        occurredAt?: string;
    }): Promise<DashboardEvent>;
    /**
     * Broadcasts an event immediately to connected SSE subscribers.
     * Also ensures outbox record is persisted and marked PUBLISHED for audit and replay.
     */
    broadcast(event: DashboardEvent): void;
    /**
     * Internal helper to dispatch an event to local connected SSE subscribers.
     */
    private dispatchToClients;
    /**
     * Transactional Outbox Batch Worker.
     * Executes periodically to process committed PENDING outbox events using FOR UPDATE SKIP LOCKED.
     * Multi-instance safe: multiple backend nodes never lock or double-process the same outbox row.
     */
    processOutboxBatch(): Promise<number>;
    /**
     * Helper to write a single formatted SSE frame:
     * id: <eventId>\n
     * event: <eventType>\n
     * data: <JSON>\n\n
     */
    private sendSseFrame;
    /**
     * Sends heartbeat keep-alive comment frames to all clients to prevent proxy timeouts.
     */
    private sendKeepAlivePing;
    /**
     * Replays missed events since Last-Event-ID for reconnecting clients.
     * Uses in-memory ring buffer first, then falls back to durable PostgreSQL outbox.
     * If cursor is expired or missing, notifies client to perform an authoritative REST snapshot refresh.
     */
    private replayMissedEvents;
    private persistOutboxEvent;
    /**
     * Strips sensitive farmer credentials, raw phone numbers, bank details, and secrets from payloads.
     */
    sanitizePayload(payload: Record<string, any>): Record<string, any>;
    /**
     * Safe scheduled cleanup for old published outbox events.
     * - Retains at least the configured recovery window (default 7 days).
     * - Never deletes PENDING or FAILED events.
     * - Never deletes events currently claimed by a worker (FOR UPDATE SKIP LOCKED).
     * - Bounded batch size (500) prevents locking and table contention.
     * - Fully idempotent.
     */
    purgeOldOutboxEvents(retentionDays?: number, batchSize?: number): Promise<number>;
    destroy(): void;
}
export declare const realtimePublisher: RealtimeEventPublisher;
//# sourceMappingURL=RealtimeEventPublisher.d.ts.map