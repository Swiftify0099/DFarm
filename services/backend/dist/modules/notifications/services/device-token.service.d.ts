import { CustomerDeviceToken, DeviceTokenRegistrationDTO } from '@dfarm/shared-types';
export declare class DeviceTokenService {
    /**
     * Registers a customer mobile device token for push notifications.
     */
    static registerToken(customerId: string, dto: DeviceTokenRegistrationDTO): Promise<CustomerDeviceToken>;
    /**
     * Refreshes an existing customer FCM device token.
     */
    static refreshToken(customerId: string, deviceId: string, fcmToken: string): Promise<CustomerDeviceToken>;
    /**
     * Deactivates a device token upon logout.
     */
    static deactivateToken(customerId: string, deviceId: string, reason?: string): Promise<void>;
    /**
     * Deactivates invalid FCM token reported dead by Firebase provider.
     */
    static deactivateInvalidToken(fcmToken: string, reason: string): Promise<void>;
    /**
     * Retrieves all active device tokens for a customer.
     */
    static getActiveTokens(customerId: string): Promise<string[]>;
}
//# sourceMappingURL=device-token.service.d.ts.map