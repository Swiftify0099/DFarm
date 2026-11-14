import type { MilkCategory, CustomerStatus } from '@dfarm/shared-types';

export interface CustomerAddress {
  village: string;
  hamletArea?: string | null;
  talukaSubdistrict: string;
  district: string;
  state: string;
  postalCode: string;
}

export interface CustomerProfile {
  id: string;
  organizationId: string;
  primaryCenterId: string;
  farmerCode: string;
  fullName: string;
  normalizedMobileNumber: string;
  status: CustomerStatus;
  registrationStatus: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  permittedCategories?: MilkCategory[];
  address?: CustomerAddress | null;
}

export interface CreateCustomerParams {
  organizationId: string;
  primaryCenterId: string;
  farmerCode?: string;
  fullName: string;
  normalizedMobileNumber: string;
  permittedCategories: MilkCategory[];
  registeredBy: string;
  deviceId?: string;
  address?: CustomerAddress;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
}

export interface UpdateCustomerParams {
  fullName?: string;
  permittedCategories?: MilkCategory[];
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  address?: Partial<CustomerAddress>;
}

export interface CustomerQueryFilter {
  organizationId: string;
  centerId?: string;
  centerIdsScope?: string[]; // authorized centers for center managers
  status?: CustomerStatus;
  search?: string;
  page: number;
  limit: number;
  sortBy: 'full_name' | 'created_at' | 'farmer_code';
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedCustomersResult {
  items: CustomerProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

