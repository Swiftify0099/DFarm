/**
 * DFarm Registration App - RFID API
 * Parity with DFarmApiService.kt & ApiRfidRepository.kt
 */

import { apiClient } from './apiClient';
import {
  RfidAssignmentDto,
  CustomerRfidStatusDto,
  RfidAssignRequest,
  RfidReplaceRequest,
  RfidRevokeRequest,
  RfidBlockRequest,
} from '../types/models';

export const rfidApi = {
  async assignRfid(customerId: string, cardUid: string): Promise<RfidAssignmentDto> {
    const payload: RfidAssignRequest = {
      cardUid,
      cardType: 'MIFARE_CLASSIC_1K',
      deviceId: 'REGISTRATION_APP',
    };
    const res = await apiClient.post<RfidAssignmentDto>(
      `api/v1/customers/${customerId}/rfid-assign`,
      payload
    );
    if (!res.data) {
      throw new Error(res.message || 'Server rejected RFID assignment');
    }
    return res.data;
  },

  async replaceRfid(
    customerId: string,
    newCardUid: string,
    reason: string
  ): Promise<RfidAssignmentDto> {
    const payload: RfidReplaceRequest = {
      newCardUid,
      reason,
      reasonCategory: 'CARD_DAMAGED',
      justificationNotes: reason,
      cardType: 'MIFARE_CLASSIC_1K',
      deviceId: 'REGISTRATION_APP',
    };
    const res = await apiClient.post<RfidAssignmentDto>(
      `api/v1/customers/${customerId}/rfid-replace`,
      payload
    );
    if (!res.data) {
      throw new Error(res.message || 'Server rejected RFID replacement');
    }
    return res.data;
  },

  async getRfidStatus(customerId: string): Promise<CustomerRfidStatusDto> {
    const res = await apiClient.get<CustomerRfidStatusDto>(
      `api/v1/customers/${customerId}/rfid-status`
    );
    if (!res.data) {
      throw new Error('Failed to retrieve RFID status for customer');
    }
    return res.data;
  },

  async revokeRfid(cardId: string, reason: string): Promise<void> {
    const payload: RfidRevokeRequest = { reason };
    await apiClient.post<any>(`api/v1/rfid/${cardId}/revoke`, payload);
  },

  async blockRfid(cardId: string, reason: string): Promise<void> {
    const payload: RfidBlockRequest = { reason };
    await apiClient.post<any>(`api/v1/rfid/${cardId}/block`, payload);
  },
};
