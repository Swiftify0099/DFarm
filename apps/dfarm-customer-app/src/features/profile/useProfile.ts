import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { secureStorage } from '../../services/secure-storage';
import { CustomerProfile } from '../../types/customer';
import { useAuth } from '../auth/useAuth';

export function useProfile() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['customers', 'profile', session?.dairyId, session?.customerId],
    queryFn: async (): Promise<CustomerProfile> => {
      const customerId = session?.customerId || (await secureStorage.getCustomerId());
      const dairyId = session?.dairyId || (await secureStorage.getDairyId());
      const response = await apiClient.get<CustomerProfile>(
        `/customers/${customerId || 'me'}`,
        {
          headers: dairyId ? { 'x-dairy-tenant-id': dairyId } : undefined,
        }
      );
      return response.data;
    },
    staleTime: 60000,
  });

  const updateFaceMutation = useMutation({
    mutationFn: async (payload: {
      embedding: number[];
      confidence: number;
    }) => {
      const customerId = await secureStorage.getCustomerId();
      const dairyId = await secureStorage.getDairyId();
      const isCustIdValid =
        customerId &&
        customerId !== 'undefined' &&
        customerId !== 'null' &&
        !customerId.startsWith('unregistered:');
      const targetId = isCustIdValid ? customerId : 'me';
      const response = await apiClient.post(
        `/customers/${targetId}/biometrics/update`,
        {
          customerId: isCustIdValid ? targetId : undefined,
          modelVersion: 'sface_int8_2021dec',
          embedding: payload.embedding,
          confidence: payload.confidence,
          organizationId: dairyId || undefined,
          timestamp: new Date().toISOString(),
        },
        {
          headers: dairyId
            ? {
                'x-organization-id': dairyId,
                'x-dairy-id': dairyId,
                'x-dairy-tenant-id': dairyId,
              }
            : undefined,
          params: dairyId ? { organizationId: dairyId } : undefined,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'profile'] });
    },
  });

  const updateBankDetailsMutation = useMutation({
    mutationFn: async (payload: {
      bankName: string;
      accountNumber: string;
      ifscCode: string;
      accountHolderName?: string;
    }) => {
      const customerId = await secureStorage.getCustomerId();
      const response = await apiClient.put(
        `/customers/${customerId || 'me'}/bank-details`,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'profile'] });
    },
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    updateFace: updateFaceMutation.mutateAsync,
    isUpdatingFace: updateFaceMutation.isPending,
    updateBankDetails: updateBankDetailsMutation.mutateAsync,
    isUpdatingBankDetails: updateBankDetailsMutation.isPending,
  };
}
