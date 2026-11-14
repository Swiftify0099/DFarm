import { apiClient } from './client.js';
export const authApi = {
    login: (username) => apiClient.post('/auth/login', { username }),
    getMe: () => apiClient.get('/auth/me'),
    getCenters: () => apiClient.get('/auth/centers'),
    sendOtp: (phone) => apiClient.post('/auth/otp/send', { phone }),
    verifyOtp: (phone, token) => apiClient.post('/auth/otp/verify', { phone, token }),
};
//# sourceMappingURL=authApi.js.map