import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { secureStorage } from '../../services/secure-storage';
import {
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  AuthSessionResponse,
} from '../../types/auth';

export function useAuth() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const token = await secureStorage.getAccessToken();
      if (!token) return null;
      const status = await secureStorage.getAuthStatus();
      const customerId = await secureStorage.getCustomerId();
      const dairyId = await secureStorage.getDairyId();
      return { token, status, customerId, dairyId };
    },
    staleTime: Infinity,
  });

  const requestOtpMutation = useMutation({
    mutationFn: async (data: RequestOtpRequest): Promise<RequestOtpResponse> => {
      await secureStorage.savePhoneNumber(data.mobileNumber);
      const response = await apiClient.post<RequestOtpResponse>(
        '/auth/request-otp',
        data
      );
      return response.data;
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (data: VerifyOtpRequest): Promise<AuthSessionResponse> => {
      await secureStorage.savePhoneNumber(data.mobileNumber);
      const response = await apiClient.post<AuthSessionResponse>(
        '/auth/verify-otp',
        data
      );
      const session = response.data;
      await secureStorage.saveSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        customerId: session.user.id,
        dairyId: session.user.selectedDairyId || undefined,
        status: session.user.status,
      });
      queryClient.setQueryData(['auth', 'session'], {
        token: session.accessToken,
        status: session.user.status,
        customerId: session.user.id,
        dairyId: session.user.selectedDairyId,
      });
      return session;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/auth/logout');
      } catch {
        // Continue clearing client session even if network fails
      }
      await secureStorage.clearSession();
      queryClient.clear();
    },
  });

  return {
    session: sessionQuery.data,
    isLoadingSession: sessionQuery.isLoading,
    requestOtp: requestOtpMutation.mutateAsync,
    isRequestingOtp: requestOtpMutation.isPending,
    verifyOtp: verifyOtpMutation.mutateAsync,
    isVerifyingOtp: verifyOtpMutation.isPending,
    logout: logoutMutation.mutateAsync,
  };
}
