import { ICollectionDatabase } from '../../database/CollectionDatabase';
import {
  CachedCustomer,
  CachedFaceTemplate,
  CachedRateCell,
  RevocationTombstone,
} from '../../types';
import {
  DeviceRevokedException,
  OfflineRevocationGuard,
} from './OfflineRevocationGuard';

export interface SyncSummary {
  pushedCount: number;
  pulledCustomersCount: number;
  pulledTemplatesCount: number;
  pulledRatesCount: number;
  appliedTombstonesCount: number;
  isSuccess: boolean;
  errorMessage?: string | null;
}

export class DFarmSyncEngine {
  constructor(
    private database: ICollectionDatabase,
    private revocationGuard: OfflineRevocationGuard
  ) {}

  /**
   * Executes Upstream Push of pending collection transactions to backend.
   */
  async pushPendingJournal(
    deviceId: string,
    centerId: string,
    httpPoster: (url: string, bodyJson: string) => Promise<{ status: number; body?: string | null }>
  ): Promise<number> {
    const pending = await this.database.getPendingJournalEvents(50);
    if (pending.length === 0) return 0;

    const eventsArray = pending.map((evt) => {
      let parsedPayload: any = {};
      try {
        parsedPayload = JSON.parse(evt.payloadJson);
      } catch (_e) {}

      return {
        id: evt.eventId,
        entityType: evt.entityType,
        entityId: evt.entityId,
        action: evt.action,
        idempotencyKey: evt.idempotencyKey,
        createdAt: new Date(evt.createdAt).toISOString(),
        payload: parsedPayload,
      };
    });

    const pushPayload = JSON.stringify({
      deviceId,
      centerId,
      events: eventsArray,
    });

    const { status, body } = await httpPoster('/api/v1/sync/push', pushPayload);
    if (status === 403) {
      throw new DeviceRevokedException('Device is revoked or blocked by central server.');
    }

    let committed = 0;
    if (status >= 200 && status < 300 && body) {
      try {
        const respElement = JSON.parse(body);
        const resultsArr = respElement?.data?.results || [];
        for (const item of resultsArr) {
          const st = item.status || '';
          const eventId = item.eventId || '';
          const matching = pending.find((e) => e.eventId === eventId);
          if (matching && (st === 'COMMITTED' || st === 'DUPLICATE')) {
            await this.database.markJournalSynced(matching.idempotencyKey);
            committed++;
          }
        }
      } catch (_e) {}
    }
    return committed;
  }

  /**
   * Executes Downstream Pull of customers, rate cells, face templates, and tombstones.
   */
  async pullDownstreamUpdates(
    centerId: string,
    httpGetter: (url: string) => Promise<{ status: number; body?: string | null }>,
    httpPoster: (url: string, bodyJson: string) => Promise<{ status: number; body?: string | null }>
  ): Promise<SyncSummary> {
    const [currentCustomerCursor, currentTombstoneCursor] =
      await this.database.getServerCursors();

    const pullUrl = `/api/v1/sync/pull?cursor=${currentCustomerCursor}&tombstoneCursor=${currentTombstoneCursor}&centerId=${centerId}`;
    const { status, body } = await httpGetter(pullUrl);

    if (status === 403) {
      throw new DeviceRevokedException(
        'Device is administratively revoked. Pull synchronization denied.'
      );
    }

    if (status < 200 || status >= 300 || !body) {
      return {
        pushedCount: 0,
        pulledCustomersCount: 0,
        pulledTemplatesCount: 0,
        pulledRatesCount: 0,
        appliedTombstonesCount: 0,
        isSuccess: false,
        errorMessage: `HTTP ${status} error`,
      };
    }

    let respElement: any = null;
    try {
      respElement = JSON.parse(body);
    } catch (_e) {
      return {
        pushedCount: 0,
        pulledCustomersCount: 0,
        pulledTemplatesCount: 0,
        pulledRatesCount: 0,
        appliedTombstonesCount: 0,
        isSuccess: false,
        errorMessage: 'Invalid JSON response',
      };
    }

    const data = respElement.data;
    if (!data) {
      return {
        pushedCount: 0,
        pulledCustomersCount: 0,
        pulledTemplatesCount: 0,
        pulledRatesCount: 0,
        appliedTombstonesCount: 0,
        isSuccess: false,
        errorMessage: 'No data object in response',
      };
    }

    let pulledCustomers = 0;
    let pulledTemplates = 0;
    let pulledRates = 0;
    let appliedTombstones = 0;

    // 1. Process Customers
    const customersArr = data.customers || [];
    for (const c of customersArr) {
      const cats = Array.isArray(c.permittedCategories)
        ? c.permittedCategories
        : ['COW', 'BUFFALO'];
      const customer: CachedCustomer = {
        customerId: c.id || '',
        farmerCode: c.farmerCode || '',
        fullName: c.fullName || '',
        mobileNumber: c.mobilePhone || c.mobileNumber || '',
        primaryCenterId: c.primaryCenterId || centerId,
        status: c.status || 'ACTIVE',
        isDeleted: false,
        isRevoked: false,
        version: 1,
        updatedAt: Date.now(),
        permittedCategories: cats.length > 0 ? cats : ['COW', 'BUFFALO'],
        rfidCardId: c.rfidCardId || null,
      };
      await this.database.saveCustomer(customer);
      pulledCustomers++;
    }

    // 2. Process Rate Chart Cells
    const rateCardsArr = data.rateCards || [];
    for (const r of rateCardsArr) {
      const cell: CachedRateCell = {
        id: r.id || '',
        rateChartVersionId: r.rateChartVersionId || '',
        fatPercentage: Number(r.fatPercentage) || 0,
        snfPercentage: Number(r.snfPercentage) || 0,
        ratePerUnit: Number(r.ratePerUnit) || 0,
        updatedAt: Date.now(),
      };
      await this.database.saveRateCell(cell);
      pulledRates++;
    }

    // 3. Process Encrypted Face Templates
    const templatesArr = data.faceTemplates || [];
    for (const t of templatesArr) {
      const template: CachedFaceTemplate = {
        id: t.id || '',
        customerId: t.customerId || '',
        modelVersion: t.modelVersion || 'MobileFaceNet-V1',
        cryptoNonce: t.cryptoNonce || '',
        authTag: t.authTag || '',
        encryptedEmbedding: t.encryptedEmbedding || '',
        status: t.status || 'ACTIVE',
        updatedAt: Date.now(),
      };
      await this.database.saveFaceTemplate(template);
      pulledTemplates++;
    }

    // 4. Process Revocation Tombstones
    const tombstonesArr = data.tombstones || [];
    for (const tb of tombstonesArr) {
      const tombstone: RevocationTombstone = {
        tombstoneId: tb.id || '',
        entityType: tb.entityType || '',
        entityId: tb.entityId || '',
        reason: tb.reason || 'Revocation',
        revokedAt: Date.now(),
      };
      await this.revocationGuard.applyRevocationTombstone(tombstone);
      appliedTombstones++;
    }

    const nextCursor =
      typeof data.nextCursor === 'number'
        ? data.nextCursor
        : currentCustomerCursor + pulledCustomers;
    const nextTombstoneCursor =
      typeof data.nextTombstoneCursor === 'number'
        ? data.nextTombstoneCursor
        : currentTombstoneCursor + appliedTombstones;

    // 5. Acknowledge cursor advance to server
    const ackPayload = JSON.stringify({
      acknowledgedCursor: nextCursor,
      tombstoneCursor: nextTombstoneCursor,
      appliedCount: pulledCustomers + appliedTombstones,
    });

    try {
      await httpPoster('/api/v1/sync/acknowledge', ackPayload);
    } catch (_e) {}

    // 6. Update local device sync state
    const now = Date.now();
    await this.database.updateSyncState(now, nextCursor, nextTombstoneCursor);

    return {
      pushedCount: 0,
      pulledCustomersCount: pulledCustomers,
      pulledTemplatesCount: pulledTemplates,
      pulledRatesCount: pulledRates,
      appliedTombstonesCount: appliedTombstones,
      isSuccess: true,
    };
  }
}
