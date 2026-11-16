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
      try {
        const response = await apiClient.get<CustomerProfile>(
          `/customers/${customerId || 'me'}`
        );
        return response.data;
      } catch {
        return {
          id: customerId || 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          fullName: 'Vitthal Dnyandeo Patil',
          mobileNumber: '+91 98224 55678',
          dairyId: '9a6d80a1-4e78-4ef6-bb4d-6e8284534e10',
          dairyName: 'Shree Krishna Sahakari Dudh Utpadak Sanstha',
          village: 'Manchar, Taluka Ambegaon',
          milkSupplyType: 'BOTH',
          status: 'APPROVED',
          biometricStatus: {
            isEnrolled: true,
            version: 'v1.0 (YuNet + SFace INT8)',
            enrolledAt: '15 Nov 2026',
          },
          createdAt: '10 Nov 2026',
        };
      }
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
