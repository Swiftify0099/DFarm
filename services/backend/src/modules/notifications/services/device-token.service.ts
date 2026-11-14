import { CustomerDeviceToken, DeviceTokenRegistrationDTO } from '@dfarm/shared-types';
import { query } from '../../../db.js';
import { logger } from '../../../shared/logger/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

export class DeviceTokenService {
  /**
   * Registers a customer mobile device token for push notifications.
   */
  public static async registerToken(
    customerId: string,
    dto: DeviceTokenRegistrationDTO
  ): Promise<CustomerDeviceToken> {
    const custRes = await query('SELECT id FROM customers WHERE id = $1 AND is_deleted = FALSE;', [customerId]);
    if (custRes.rows.length === 0) {
      throw new NotFoundError(`Customer '${customerId}' not found or inactive`);
    }

    const res = await query(
      `INSERT INTO customer_device_tokens (
         customer_id, device_id, device_platform, fcm_token,
         is_active, last_registered_at, deactivated_at, deactivation_reason, updated_at
       ) VALUES ($1, $2, $3, $4, TRUE, NOW(), NULL, NULL, NOW())
       ON CONFLICT (customer_id, device_id)
       DO UPDATE SET
         device_platform = EXCLUDED.device_platform,
         fcm_token = EXCLUDED.fcm_token,
         is_active = TRUE,
         last_registered_at = NOW(),
         deactivated_at = NULL,
         deactivation_reason = NULL,
         updated_at = NOW()
       RETURNING *;`,
      [customerId, dto.deviceId, dto.devicePlatform || 'ANDROID', dto.fcmToken]
    );

    const row = res.rows[0];
    logger.info(
      { customerId, deviceId: dto.deviceId, platform: dto.devicePlatform },
      'Customer device push token registered'
    );

    return {
      id: row.id,
      customerId: row.customer_id,
      deviceId: row.device_id,
      devicePlatform: row.device_platform,
      fcmToken: row.fcm_token,
      isActive: row.is_active,
      lastRegisteredAt: row.last_registered_at,
      deactivatedAt: row.deactivated_at,
      deactivationReason: row.deactivation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Refreshes an existing customer FCM device token.
   */
  public static async refreshToken(
    customerId: string,
    deviceId: string,
    fcmToken: string
  ): Promise<CustomerDeviceToken> {
    const res = await query(
      `UPDATE customer_device_tokens
       SET fcm_token = $1,
           is_active = TRUE,
           last_registered_at = NOW(),
           deactivated_at = NULL,
           deactivation_reason = NULL,
           updated_at = NOW()
       WHERE customer_id = $2 AND device_id = $3
       RETURNING *;`,
      [fcmToken, customerId, deviceId]
    );

    if (res.rows.length === 0) {
      // If not yet registered, register it now
      return this.registerToken(customerId, {
        deviceId,
        devicePlatform: 'ANDROID',
        fcmToken,
      });
    }

    const row = res.rows[0];
    logger.info({ customerId, deviceId }, 'Customer device push token refreshed');

    return {
      id: row.id,
      customerId: row.customer_id,
      deviceId: row.device_id,
      devicePlatform: row.device_platform,
      fcmToken: row.fcm_token,
      isActive: row.is_active,
      lastRegisteredAt: row.last_registered_at,
      deactivatedAt: row.deactivated_at,
      deactivationReason: row.deactivation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Deactivates a device token upon logout.
   */
  public static async deactivateToken(
    customerId: string,
    deviceId: string,
    reason = 'USER_LOGOUT'
  ): Promise<void> {
    await query(
      `UPDATE customer_device_tokens
       SET is_active = FALSE,
           deactivated_at = NOW(),
           deactivation_reason = $1,
           updated_at = NOW()
       WHERE customer_id = $2 AND device_id = $3;`,
      [reason, customerId, deviceId]
    );
    logger.info({ customerId, deviceId, reason }, 'Customer device push token deactivated');
  }

  /**
   * Deactivates invalid FCM token reported dead by Firebase provider.
   */
  public static async deactivateInvalidToken(fcmToken: string, reason: string): Promise<void> {
    await query(
      `UPDATE customer_device_tokens
       SET is_active = FALSE,
           deactivated_at = NOW(),
           deactivation_reason = $1,
           updated_at = NOW()
       WHERE fcm_token = $2;`,
      [`INVALID_TOKEN: ${reason}`, fcmToken]
    );
    logger.warn({ reason }, 'Deactivated invalid FCM token across customer devices');
  }

  /**
   * Retrieves all active device tokens for a customer.
   */
  public static async getActiveTokens(customerId: string): Promise<string[]> {
    const res = await query(
      `SELECT fcm_token
       FROM customer_device_tokens
       WHERE customer_id = $1 AND is_active = TRUE
       ORDER BY last_registered_at DESC;`,
      [customerId]
    );
    return res.rows.map(r => r.fcm_token);
  }
}
