/**
 * DFarm Registration App - Customer API
 * Parity with DFarmApiService.kt & CustomerRepository.kt
 */

import { apiClient } from './apiClient';
import {
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CustomerDto,
  CustomerListResponse,
} from '../types/models';

export const customerApi = {
  async createCustomer(request: CreateCustomerRequest): Promise<CustomerDto> {
    const res = await apiClient.post<CustomerDto>('api/v1/customers', request);
    if (!res.data) {
      throw new Error('Registration succeeded but no customer data was returned');
    }
    return res.data;
  },

  async getCustomer(customerId: string): Promise<CustomerDto> {
    const res = await apiClient.get<CustomerDto>(`api/v1/customers/${customerId}`);
    if (!res.data) {
      throw new Error('Customer profile not found');
    }
    return res.data;
  },

  async listCustomers(params: {
    page?: number;
    limit?: number;
    search?: string | null;
    centerId?: string | null;
    status?: string | null;
  } = {}): Promise<CustomerListResponse> {
    const res = await apiClient.get<CustomerListResponse>('api/v1/customers', {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      search: params.search?.trim() || undefined,
      centerId: params.centerId || undefined,
      status: params.status || undefined,
    });
    return (
      res.data || {
        items: [],
        total: 0,
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        totalPages: 1,
      }
    );
  },

  async updateCustomer(
    customerId: string,
    request: UpdateCustomerRequest
  ): Promise<CustomerDto> {
    const res = await apiClient.patch<CustomerDto>(`api/v1/customers/${customerId}`, request);
    if (!res.data) {
      throw new Error('Customer updated but no response data returned');
    }
    return res.data;
  },

  async deleteCustomer(customerId: string, reason: string): Promise<CustomerDto> {
    const res = await apiClient.delete<CustomerDto>(`api/v1/customers/${customerId}`, {
      reason,
    });
    if (!res.data) {
      throw new Error('Customer deactivated but no response data returned');
    }
    return res.data;
  },

  async restoreCustomer(customerId: string, reason: string): Promise<CustomerDto> {
    const res = await apiClient.post<CustomerDto>(`api/v1/customers/${customerId}/restore`, {
      reason,
    });
    if (!res.data) {
      throw new Error('Customer restored but no response data returned');
    }
    return res.data;
  },
};
