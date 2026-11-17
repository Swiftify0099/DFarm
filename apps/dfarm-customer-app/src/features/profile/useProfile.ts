import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { secureStorage } from '../../services/secure-storage';
import { CustomerProfile } from '../../types/customer';

export function useProfile() {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['customers', 'profile'],
    queryFn: async (): Promise<CustomerProfile> => {
      const customerId = await secureStorage.getCustomerId();
      const response = await apiClient.get<CustomerProfile>(
        `/customers/${customerId || 'me'}`
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
      const response = await apiClient.post(
        `/customers/${customerId}/biometrics/update`,
        {
          modelVersion: 'sface_int8_2021dec',
          embedding: payload.embedding,
          confidence: payload.confidence,
          timestamp: new Date().toISOString(),
        }
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
  };
}
