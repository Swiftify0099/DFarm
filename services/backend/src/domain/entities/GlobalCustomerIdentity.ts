export interface GlobalCustomerIdentityProps {
  id: string;
  normalizedMobileNumber: string;
  phoneVerifiedAt: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export class GlobalCustomerIdentity {
  private props: GlobalCustomerIdentityProps;

  constructor(props: GlobalCustomerIdentityProps) {
    this.props = {
      ...props,
      phoneVerifiedAt: props.phoneVerifiedAt || new Date(),
      createdAt: props.createdAt || new Date(),
      updatedAt: props.updatedAt || new Date(),
    };
  }

  public get id(): string {
    return this.props.id;
  }

  public get normalizedMobileNumber(): string {
    return this.props.normalizedMobileNumber;
  }

  public get phoneVerifiedAt(): string {
    return this.props.phoneVerifiedAt instanceof Date
      ? this.props.phoneVerifiedAt.toISOString()
      : String(this.props.phoneVerifiedAt);
  }

  public get createdAt(): string {
    return this.props.createdAt instanceof Date
      ? this.props.createdAt.toISOString()
      : String(this.props.createdAt);
  }

  public get updatedAt(): string {
    return this.props.updatedAt instanceof Date
      ? this.props.updatedAt.toISOString()
      : String(this.props.updatedAt);
  }

  public toJSON() {
    return {
      id: this.id,
      normalizedMobileNumber: this.normalizedMobileNumber,
      phoneVerifiedAt: this.phoneVerifiedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
