export type MembershipStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'UNREGISTERED';

export interface CustomerMembershipProps {
  id: string;
  globalCustomerId: string;
  organizationId: string;
  tenantCustomerId: string;
  farmerCode?: string | null;
  customerName?: string | null;
  membershipStatus: MembershipStatus;
  dairyName: string;
  dairyCode?: string | null;
  dairyAddress?: string | null;
  centerId?: string | null;
  centerName?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  lastSynchronizedAt?: string | Date;
}

export class CustomerMembership {
  private props: CustomerMembershipProps;

  constructor(props: CustomerMembershipProps) {
    this.props = {
      ...props,
      farmerCode: props.farmerCode ?? null,
      customerName: props.customerName ?? null,
      dairyCode: props.dairyCode ?? null,
      dairyAddress: props.dairyAddress ?? null,
      centerId: props.centerId ?? null,
      centerName: props.centerName ?? null,
      createdAt: props.createdAt || new Date(),
      updatedAt: props.updatedAt || new Date(),
      lastSynchronizedAt: props.lastSynchronizedAt || new Date(),
    };
  }

  public get id(): string {
    return this.props.id;
  }

  public get globalCustomerId(): string {
    return this.props.globalCustomerId;
  }

  public get organizationId(): string {
    return this.props.organizationId;
  }

  public get tenantCustomerId(): string {
    return this.props.tenantCustomerId;
  }

  public get farmerCode(): string | null | undefined {
    return this.props.farmerCode;
  }

  public get customerName(): string | null | undefined {
    return this.props.customerName;
  }

  public get membershipStatus(): MembershipStatus {
    return this.props.membershipStatus;
  }

  public get dairyName(): string {
    return this.props.dairyName;
  }

  public get dairyCode(): string | null | undefined {
    return this.props.dairyCode;
  }

  public get dairyAddress(): string | null | undefined {
    return this.props.dairyAddress;
  }

  public get centerId(): string | null | undefined {
    return this.props.centerId;
  }

  public get centerName(): string | null | undefined {
    return this.props.centerName;
  }

  public get isApproved(): boolean {
    return this.props.membershipStatus === 'APPROVED';
  }

  public updateStatus(status: MembershipStatus, farmerCode?: string | null): void {
    this.props.membershipStatus = status;
    if (farmerCode !== undefined) {
      this.props.farmerCode = farmerCode;
    }
    this.props.updatedAt = new Date();
    this.props.lastSynchronizedAt = new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      globalCustomerId: this.globalCustomerId,
      organizationId: this.organizationId,
      dairyId: this.organizationId,
      tenantCustomerId: this.tenantCustomerId,
      farmerCode: this.farmerCode,
      customerName: this.customerName,
      membershipStatus: this.membershipStatus,
      status: this.membershipStatus,
      dairyName: this.dairyName,
      dairyCode: this.dairyCode,
      dairyAddress: this.dairyAddress,
      centerId: this.centerId,
      centerName: this.centerName,
      isApproved: this.isApproved,
      createdAt: this.props.createdAt instanceof Date ? this.props.createdAt.toISOString() : String(this.props.createdAt),
      updatedAt: this.props.updatedAt instanceof Date ? this.props.updatedAt.toISOString() : String(this.props.updatedAt),
      lastSynchronizedAt: this.props.lastSynchronizedAt instanceof Date ? this.props.lastSynchronizedAt.toISOString() : String(this.props.lastSynchronizedAt),
    };
  }
}
