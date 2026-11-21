import { Money, FatPercentage, SnfPercentage, MilkWeight } from '../value-objects/index.js';

export type IdentificationMethod = 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH';
export type SyncStatus = 'SYNCED_CLOUD' | 'PENDING_OFFLINE' | 'SYNC_FAILED';

export interface MilkCollectionTransactionProps {
  id: string;
  transactionCode: string;
  sessionId: string;
  dairyId: string;
  centerId: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  timestamp: string;
  date: string;
  shift: 'MORNING' | 'EVENING';
  milkCategory: 'COW' | 'BUFFALO';
  weightLiters: number;
  fatPercentage: number;
  snfPercentage: number;
  clrDensity: number;
  appliedRatePerLiter: number;
  rateChartVersion: number;
  totalAmount: number;
  identificationMethod: IdentificationMethod;
  syncStatus: SyncStatus;
  deviceId: string;
  operatorName: string;
  idempotencyKey?: string;
}

export class MilkCollectionTransaction {
  private props: MilkCollectionTransactionProps;

  constructor(props: MilkCollectionTransactionProps) {
    // Domain validation using value objects
    new MilkWeight(props.weightLiters);
    new FatPercentage(props.fatPercentage, props.milkCategory);
    new SnfPercentage(props.snfPercentage, props.milkCategory);
    new Money(props.totalAmount);

    this.props = { ...props };
  }

  public get id(): string {
    return this.props.id;
  }

  public get transactionCode(): string {
    return this.props.transactionCode;
  }

  public get customerId(): string {
    return this.props.customerId;
  }

  public get customerCode(): string {
    return this.props.customerCode;
  }

  public get customerName(): string {
    return this.props.customerName;
  }

  public get weightLiters(): number {
    return this.props.weightLiters;
  }

  public get totalAmount(): number {
    return this.props.totalAmount;
  }

  public get appliedRatePerLiter(): number {
    return this.props.appliedRatePerLiter;
  }

  public get idempotencyKey(): string | undefined {
    return this.props.idempotencyKey;
  }

  public toJSON() {
    return {
      ...this.props,
      quantityLiters: this.props.weightLiters,
      ratePerLiter: this.props.appliedRatePerLiter,
      animalType: this.props.milkCategory,
      receiptNumber: this.props.transactionCode,
      collectionDate: this.props.date,
      collectionTime: this.props.timestamp?.includes('T')
        ? (this.props.timestamp.split('T')[1] || '').substring(0, 5)
        : (this.props.timestamp || ''),
    };
  }
}
