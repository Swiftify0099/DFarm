import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { secureStorage } from '../../services/secure-storage';
import {
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  AuthSessionResponse,
  CustomerMembership,
  SwitchDairyRequest,
  SwitchDairyResponse,
  MembershipsResponse,
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
      const globalCustomerId = await secureStorage.getGlobalCustomerId();
      const dairyId = await secureStorage.getDairyId();
      const dairyName = await secureStorage.getDairyName();
      return { token, status, customerId, globalCustomerId, dairyId, dairyName };
    },
    staleTime: Infinity,
  });

  const membershipsQuery = useQuery<CustomerMembership[]>({
    queryKey: ['customers', 'memberships'],
    queryFn: async () => {
      const token = await secureStorage.getAccessToken();
      if (!token) return [];
      try {
        const res = await apiClient.get<MembershipsResponse>('/customers/memberships');
        return res.data.memberships || res.data.data || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(sessionQuery.data?.token),
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
      const globalCustId = session.globalCustomerId || session.user.globalCustomerId || session.user.id;
      const dairyName = session.user.customerProfile?.dairyName;

      await secureStorage.saveSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        customerId: session.user.id,
        globalCustomerId: globalCustId,
        dairyId: session.user.selectedDairyId || undefined,
        dairyName,
        status: session.user.status,
      });

      queryClient.setQueryData(['auth', 'session'], {
        token: session.accessToken,
        status: session.user.status,
        customerId: session.user.id,
        globalCustomerId: globalCustId,
        dairyId: session.user.selectedDairyId,
        dairyName,
      });

      if (session.memberships && session.memberships.length > 0) {
        queryClient.setQueryData(['customers', 'memberships'], session.memberships);
      }

      return session;
    },
  });

  const switchDairyMutation = useMutation({
    mutationFn: async (data: SwitchDairyRequest): Promise<SwitchDairyResponse> => {
      const response = await apiClient.post<SwitchDairyResponse>(
        '/customers/switch-dairy',
        data
      );
      const res = response.data;

      await secureStorage.saveSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        customerId: res.selectedDairy.tenantCustomerId,
        globalCustomerId: res.user.globalCustomerId,
        dairyId: res.selectedDairy.dairyId,
        dairyName: res.selectedDairy.dairyName,
        status: res.selectedDairy.membershipStatus,
      });

      queryClient.setQueryData(['auth', 'session'], {
        token: res.accessToken,
        status: res.selectedDairy.membershipStatus,
        customerId: res.selectedDairy.tenantCustomerId,
        globalCustomerId: res.user.globalCustomerId,
        dairyId: res.selectedDairy.dairyId,
        dairyName: res.selectedDairy.dairyName,
      });

      // Clear all tenant-scoped operational query caches
      queryClient.removeQueries({ queryKey: ['customers'] });
      queryClient.removeQueries({ queryKey: ['collection'] });
      queryClient.removeQueries({ queryKey: ['ledger'] });
      queryClient.removeQueries({ queryKey: ['bills'] });
      queryClient.removeQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['customers', 'memberships'] });

      return res;
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
    memberships: membershipsQuery.data || [],
    isLoadingMemberships: membershipsQuery.isLoading,
    refetchMemberships: membershipsQuery.refetch,
    requestOtp: requestOtpMutation.mutateAsync,
    isRequestingOtp: requestOtpMutation.isPending,
    verifyOtp: verifyOtpMutation.mutateAsync,
    isVerifyingOtp: verifyOtpMutation.isPending,
    switchDairy: switchDairyMutation.mutateAsync,
    isSwitchingDairy: switchDairyMutation.isPending,
    logout: logoutMutation.mutateAsync,
  };
}
