import { SessionClosedError } from '../errors/index.js';

export type ShiftType = 'MORNING' | 'EVENING';
export type ShiftSessionStatus = 'OPEN' | 'CLOSED';

export interface KioskShiftSessionProps {
  id: string;
  sessionCode: string;
  organizationId: string;
  centerId: string;
  businessDate: string;
  shift: ShiftType;
  status: ShiftSessionStatus;
  openedAt: string;
  closedAt?: string | null;
  openingOperatorId: string;
  openingOperatorName: string;
  closingOperatorId?: string | null;
  closingOperatorName?: string | null;
  deviceIdentifier: string;
  deviceName: string;
  totalLiters: number;
  cowLiters: number;
  buffaloLiters: number;
  transactionCount: number;
  totalAmount: number;
  averageFat: number;
  averageSnf: number;
}

export class KioskShiftSession {
  private props: KioskShiftSessionProps;

  constructor(props: KioskShiftSessionProps) {
    this.props = { ...props };
  }

  public get id(): string {
    return this.props.id;
  }

  public get sessionCode(): string {
    return this.props.sessionCode;
  }

  public get organizationId(): string {
    return this.props.organizationId;
  }

  public get centerId(): string {
    return this.props.centerId;
  }

  public get businessDate(): string {
    return this.props.businessDate;
  }

  public get shift(): ShiftType {
    return this.props.shift;
  }

  public get status(): ShiftSessionStatus {
    return this.props.status;
  }

  public get isOpen(): boolean {
    return this.props.status === 'OPEN';
  }

  public get openedAt(): string {
    return this.props.openedAt;
  }

  public get closedAt(): string | null | undefined {
    return this.props.closedAt;
  }

  public get totals() {
    return {
      totalLiters: this.props.totalLiters,
      cowLiters: this.props.cowLiters,
      buffaloLiters: this.props.buffaloLiters,
      transactionCount: this.props.transactionCount,
      totalAmount: this.props.totalAmount,
      averageFat: this.props.averageFat,
      averageSnf: this.props.averageSnf,
    };
  }

  public get deviceIdentifier(): string {
    return this.props.deviceIdentifier;
  }

  public get deviceName(): string {
    return this.props.deviceName;
  }

  public get openingOperatorName(): string {
    return this.props.openingOperatorName;
  }

  public recordTransaction(category: 'COW' | 'BUFFALO', weightLiters: number, fat: number, snf: number, amount: number): void {
    if (!this.isOpen) {
      throw new SessionClosedError(this.props.sessionCode);
    }

    const prevCount = this.props.transactionCount;
    const prevFatSum = this.props.averageFat * prevCount;
    const prevSnfSum = this.props.averageSnf * prevCount;

    const newCount = prevCount + 1;
    this.props.transactionCount = newCount;
    this.props.totalLiters = Math.round((this.props.totalLiters + weightLiters + Number.EPSILON) * 100) / 100;
    if (category === 'COW') {
      this.props.cowLiters = Math.round((this.props.cowLiters + weightLiters + Number.EPSILON) * 100) / 100;
    } else {
      this.props.buffaloLiters = Math.round((this.props.buffaloLiters + weightLiters + Number.EPSILON) * 100) / 100;
    }
    this.props.totalAmount = Math.round((this.props.totalAmount + amount + Number.EPSILON) * 100) / 100;
    this.props.averageFat = Math.round(((prevFatSum + fat) / newCount + Number.EPSILON) * 100) / 100;
    this.props.averageSnf = Math.round(((prevSnfSum + snf) / newCount + Number.EPSILON) * 100) / 100;
  }

  public close(operatorId: string, operatorName: string): void {
    if (!this.isOpen) {
      throw new SessionClosedError(this.props.sessionCode);
    }
    this.props.status = 'CLOSED';
    this.props.closedAt = new Date().toISOString();
    this.props.closingOperatorId = operatorId;
    this.props.closingOperatorName = operatorName;
  }

  public toJSON() {
    return {
      id: this.props.id,
      sessionCode: this.props.sessionCode,
      dairyId: this.props.organizationId,
      centerId: this.props.centerId,
      date: this.props.businessDate,
      shift: this.props.shift,
      status: this.props.status,
      openedAt: this.props.openedAt,
      closedAt: this.props.closedAt,
      openingOperatorName: this.props.openingOperatorName,
      closingOperatorName: this.props.closingOperatorName,
      deviceId: this.props.deviceIdentifier,
      deviceName: this.props.deviceName,
      totals: this.totals,
    };
  }
}
