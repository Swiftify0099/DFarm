/**
 * DFarm Registration App - Auth API
 * Parity with DFarmApiService.kt auth endpoints & AuthRepository.kt
 */

import { apiClient } from './apiClient';
import {
  LoginRequest,
  LoginResponse,
  UserMeResponse,
  CenterDto,
  ApiResponse,
  OfficerProfile,
  AssignedCenter,
} from '../types/models';

export const authApi = {
  async login(email: string, password: string): Promise<{ token: string; officer: OfficerProfile }> {
    const res = await apiClient.post<any>('api/v1/auth/login', {
      email: email.trim(),
      password,
      username: email.trim(),
    });

    const body: LoginResponse = res as any;
    const token = body.token || body.data?.token;

    let officer: OfficerProfile | null =
      body.officer ||
      (body.data?.user
        ? {
            id: body.data.user.id || '',
            email: body.data.user.email || body.data.user.username || '',
            fullName: body.data.user.fullName || body.data.user.username || 'Staff Officer',
            role: body.data.user.role || 'REGISTRATION_OFFICER',
            organizationId: body.data.user.organizationId || '',
            centerId: body.data.user.primaryCenterId || null,
            assignedCenters: (body.data.user.assignedCenters || []).map((c: CenterDto) => ({
              centerId: c.id,
              centerName: c.name || c.code || c.id,
              centerCode: c.code || '',
            })),
          }
        : null);

    if (!token || !officer) {
      throw new Error('Login response missing token or officer details');
    }

    // If officer assignedCenters is empty, enrich from getCenters endpoint
    if (!officer.assignedCenters || officer.assignedCenters.length === 0) {
      try {
        const centersRes = await authApi.getCenters();
        if (centersRes.data && centersRes.data.length > 0) {
          const assigned: AssignedCenter[] = centersRes.data.map((c) => ({
            centerId: c.id,
            centerName: c.name || c.code || c.id,
            centerCode: c.code || '',
          }));
          const primaryId = officer.centerId || assigned[0]?.centerId || null;
          officer = {
            ...officer,
            assignedCenters: assigned,
            centerId: primaryId,
          };
        }
      } catch {
        // Fallback to existing officer profile
      }
    }

    return { token, officer };
  },

  async getMe(): Promise<OfficerProfile | null> {
    const res = await apiClient.get<any>('api/v1/auth/me');
    const body: UserMeResponse = res as any;

    if (body.officer) return body.officer;
    if (body.data?.officer) return body.data.officer;

    if (body.data) {
      return {
        id: body.data.internalId || body.data.authUserId || '',
        email: '',
        fullName: 'Staff Officer',
        role: body.data.role || 'REGISTRATION_OFFICER',
        organizationId: body.data.organizationId || '',
        centerId: body.data.primaryCenterId || null,
        assignedCenters: (body.data.authorizedCenterIds || []).map((id) => ({
          centerId: id,
          centerName: id,
          centerCode: '',
        })),
      };
    }

    return null;
  },

  async getCenters(): Promise<ApiResponse<CenterDto[]>> {
    return apiClient.get<CenterDto[]>('api/v1/auth/centers');
  },
};
