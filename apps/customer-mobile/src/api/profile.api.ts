/**
 * Profile and Account API
 * Customer profile, contact information, consent status, and preferences.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerProfileData {
  id: string;
  organizationId: string;
  primaryCenterId: string;
  farmerCode: string;
  fullName: string;
  normalizedMobileNumber: string;
  status: string;
  registrationStatus: string;
  bankName?: string | null;
  bankAccountNumber?: string | null; // Masked for customer privacy
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  customerAddresses?: Array<{
    village?: string;
    hamletArea?: string;
    talukaSubdistrict?: string;
    district?: string;
    state?: string;
    postalCode?: string;
  }>;
  customerMilkCategories?: Array<{
    milkCategory: 'COW' | 'BUFFALO';
    isAuthorized: boolean;
  }>;
  createdAt: string;
}

export interface ProfileUpdateInput {
  email?: string;
  preferredLanguage?: string;
  notificationConsent?: boolean;
}

export const profileApi = {
  async getProfile(customerId: string): Promise<{ data: CustomerProfileData; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `profile_${customerId}`;

    try {
      const data = await request<CustomerProfileData>(`/customers/${customerId}`, {
        method: 'GET',
      });
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<CustomerProfileData>(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          fromCache: true,
          syncedAt: cached.syncedAt,
        };
      }
      throw err;
    }
  },

  async updateProfile(
    customerId: string,
    input: ProfileUpdateInput
  ): Promise<{ success: boolean; message: string; preferences: any }> {
    return request<{ success: boolean; message: string; preferences: any }>(
      `/customers/${customerId}/profile`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },
};
