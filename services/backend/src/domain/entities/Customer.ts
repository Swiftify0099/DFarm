import { RfidUid } from '../value-objects/index.js';
import { CustomerSuspendedError, CategoryNotAuthorizedError } from '../errors/index.js';

export type MilkCategory = 'COW' | 'BUFFALO';
export type CustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'DRAFT' | 'INACTIVE';
export type CustomerRegistrationStatus = 'UNREGISTERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface CustomerProps {
  id: string;
  organizationId: string;
  centerId: string;
  farmerCode: string;
  fullName: string;
  mobileNumber: string;
  status: CustomerStatus;
  registrationStatus: CustomerRegistrationStatus;
  permittedCategories: MilkCategory[];
  village?: string;
  rfidCardUid?: string | null;
  faceTemplateEnrolled?: boolean;
  balanceDue?: number;
  lastDelivery?: {
    date: string;
    shift: 'MORNING' | 'EVENING';
    liters: number;
  } | null;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
  };
  isDeleted?: boolean;
  deletionReason?: string;
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class Customer {
  private props: CustomerProps;

  constructor(props: CustomerProps) {
    this.props = {
      ...props,
      balanceDue: props.balanceDue ?? 0.0,
      permittedCategories: props.permittedCategories || ['COW'],
    };
  }

  public get id(): string {
    return this.props.id;
  }

  public get organizationId(): string {
    return this.props.organizationId;
  }

  public get centerId(): string {
    return this.props.centerId;
  }

  public get farmerCode(): string {
    return this.props.farmerCode;
  }

  public get fullName(): string {
    return this.props.fullName;
  }

  public get mobileNumber(): string {
    return this.props.mobileNumber;
  }

  public get status(): CustomerStatus {
    return this.props.status;
  }

  public get registrationStatus(): CustomerRegistrationStatus {
    return this.props.registrationStatus;
  }

  public get permittedCategories(): MilkCategory[] {
    return [...this.props.permittedCategories];
  }

  public get village(): string | undefined {
    return this.props.village;
  }

  public get rfidCardUid(): string | null | undefined {
    return this.props.rfidCardUid;
  }

  public get isBiometricEnrolled(): boolean {
    return Boolean(this.props.faceTemplateEnrolled);
  }

  public get balanceDue(): number {
    return this.props.balanceDue || 0.0;
  }

  public get isDeleted(): boolean {
    return Boolean(this.props.isDeleted);
  }

  public get lastDelivery() {
    return this.props.lastDelivery;
  }

  public validateCanDeliver(category: MilkCategory): void {
    if (this.props.status === 'SUSPENDED') {
      throw new CustomerSuspendedError(this.props.fullName);
    }
    if (!this.props.permittedCategories.includes(category)) {
      throw new CategoryNotAuthorizedError(category, this.props.fullName);
    }
  }

  public assignRfid(cardUid: string): void {
    const rfid = new RfidUid(cardUid);
    this.props.rfidCardUid = rfid.value;
  }

  public setFaceTemplateEnrolled(enrolled: boolean): void {
    this.props.faceTemplateEnrolled = enrolled;
  }

  public get bankDetails() {
    return this.props.bankDetails;
  }

  public get rejectionReason(): string | undefined {
    return this.props.rejectionReason;
  }

  public approveRegistration(assignedCode?: string): void {
    this.props.registrationStatus = 'APPROVED';
    this.props.status = 'ACTIVE';
    if (assignedCode) {
      this.props.farmerCode = assignedCode;
    }
    this.props.updatedAt = new Date().toISOString();
  }

  public rejectRegistration(reason: string): void {
    this.props.registrationStatus = 'REJECTED';
    this.props.status = 'INACTIVE';
    this.props.rejectionReason = reason;
    this.props.updatedAt = new Date().toISOString();
  }

  public toJSON() {
    return {
      ...this.props,
      customerCode: this.props.farmerCode, // Backward compatibility with frontend
      isSoftDeleted: Boolean(this.props.isDeleted),
      faceEnrollmentStatus: this.props.faceTemplateEnrolled ? 'ENROLLED' : 'NOT_ENROLLED',
    };
  }
}
