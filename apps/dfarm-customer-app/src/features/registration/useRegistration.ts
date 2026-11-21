import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { secureStorage } from '../../services/secure-storage';
import {
  CustomerRegistrationRequest,
  RegistrationResponse,
} from '../../types/customer';

export interface CustomerRegistrationStatusInfo {
  status: string;
  registrationStatus?: string;
  reason?: string;
  rejectionReason?: string;
  assignedDairyName?: string;
  customerCode?: string;
  farmerCode?: string;
  fullName?: string;
}

export function useRegistration() {
  const registerMutation = useMutation({
    mutationFn: async (
      data: CustomerRegistrationRequest
    ): Promise<RegistrationResponse> => {
      const phone = data.mobileNumber || (await secureStorage.getPhoneNumber()) || undefined;
      const payload = {
        ...data,
        mobileNumber: phone,
      };

      const response = await apiClient.post<RegistrationResponse>(
        '/customers/register',
        payload
      );
      const result = response.data;
      await secureStorage.saveSession({
        accessToken: (await secureStorage.getAccessToken()) || '',
        refreshToken: (await secureStorage.getRefreshToken()) || '',
        customerId: result.customerUuid,
        dairyId: data.selectedDairyId,
        status: 'PENDING_APPROVAL',
      });
      return result;
    },
  });

  const checkStatusQuery = useQuery<CustomerRegistrationStatusInfo | null>({
    queryKey: ['customers', 'registration-status'],
    queryFn: async () => {
      const customerId = await secureStorage.getCustomerId();
      if (!customerId) return null;
      const response = await apiClient.get<CustomerRegistrationStatusInfo>(`/customers/${customerId}/status`);
      return response.data;
    },
    refetchInterval: 10000, // Poll every 10 seconds on pending screen
  });

  return {
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    status: checkStatusQuery.data,
    isCheckingStatus: checkStatusQuery.isLoading,
    refetchStatus: checkStatusQuery.refetch,
  };
}
