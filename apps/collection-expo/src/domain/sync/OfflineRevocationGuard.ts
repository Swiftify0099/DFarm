import { ICollectionDatabase } from '../../database/CollectionDatabase';
import { RevocationTombstone } from '../../types';

export class OfflineAuthorizationExpiredException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineAuthorizationExpiredException';
  }
}

export class DeviceRevokedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceRevokedException';
  }
}

export class OfflineRevocationGuard {
  constructor(
    private database: ICollectionDatabase,
    public maxOfflineHours: number = 72
  ) {}

  async isAuthorizationValid(): Promise<boolean> {
    const lastSync = await this.database.getLastSyncTimestamp();
    if (lastSync === 0) {
      // Uninitialized or freshly provisioned - allow initial sync window
      return true;
    }
    const elapsedMillis = Date.now() - lastSync;
    const elapsedHours = elapsedMillis / (1000 * 3600);
    return elapsedHours <= this.maxOfflineHours;
  }

  async assertAuthorizationValid(): Promise<void> {
    const valid = await this.isAuthorizationValid();
    if (!valid) {
      const lastSync = await this.database.getLastSyncTimestamp();
      const elapsedHours = Math.round((Date.now() - lastSync) / (1000 * 3600));
      throw new OfflineAuthorizationExpiredException(
        `Offline authorization window expired (${elapsedHours} hours since last central cloud sync, max allowed: ${this.maxOfflineHours} hours). Central cloud connectivity required to re-authorize tablet.`
      );
    }
  }

  async applyRevocationTombstone(tombstone: RevocationTombstone): Promise<void> {
    await this.database.applyTombstone(tombstone);
  }

  async isCustomerAuthorized(customerId: string): Promise<boolean> {
    await this.assertAuthorizationValid();
    const customer = await this.database.getCustomer(customerId);
    if (!customer) return false;
    return (
      customer.status === 'ACTIVE' &&
      !customer.isDeleted &&
      !customer.isRevoked
    );
  }
}
