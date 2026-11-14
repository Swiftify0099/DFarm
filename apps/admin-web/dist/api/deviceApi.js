import { apiClient } from './client.js';
export const deviceApi = {
    listDevices: (params) => apiClient.get('/devices', params),
    approveOfflinePolicy: (deviceId, maxOfflineHours = 72) => apiClient.post(`/devices/${deviceId}/approve-offline`, { maxOfflineHours }),
    revokeDevice: (deviceId, reason) => apiClient.post('/devices/revoke', { deviceId, reason }),
    getConflicts: () => apiClient.get('/sync/conflicts'),
    getEvents: () => apiClient.get('/sync/events'),
};
//# sourceMappingURL=deviceApi.js.map