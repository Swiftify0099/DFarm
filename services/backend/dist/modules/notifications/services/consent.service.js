import { NotificationChannel } from '@dfarm/shared-types';
import { query } from '../../../db.js';
import { logger } from '../../../shared/logger/index.js';
export class ConsentService {
    /**
     * Checks whether communication consent is actively granted for a customer and channel.
     * Checks both whatsapp_customer_mappings and customer_consent_records.
     */
    static async isConsentGranted(customerId, channel, _organizationId) {
        // 1. In-app notifications are internal operational records, always enabled unless customer is soft-deleted
        if (channel === NotificationChannel.IN_APP) {
            return true;
        }
        // 2. Check WhatsApp channel opt-in
        if (channel === NotificationChannel.WHATSAPP) {
            const waRes = await query(`SELECT is_opted_in, opt_out_timestamp
         FROM whatsapp_customer_mappings
         WHERE customer_id = $1
         LIMIT 1;`, [customerId]);
            if (waRes.rows.length > 0 && waRes.rows[0].is_opted_in === false) {
                logger.info({ customerId, channel }, 'Customer opted out of WhatsApp communication');
                return false;
            }
        }
        // 3. Check customer_consent_records for explicit revocation
        const consentType = channel === NotificationChannel.WHATSAPP ? 'COMMUNICATION_WHATSAPP' : 'COMMUNICATION_PUSH';
        const consentRes = await query(`SELECT consent_granted, revoked_at
       FROM customer_consent_records
       WHERE customer_id = $1
         AND (consent_type = $2 OR consent_type = 'ALL_COMMUNICATIONS')
       ORDER BY recorded_at DESC
       LIMIT 1;`, [customerId, consentType]);
        if (consentRes.rows.length > 0) {
            const row = consentRes.rows[0];
            if (!row.consent_granted || row.revoked_at !== null) {
                logger.info({ customerId, channel, consentType }, 'Customer consent revoked in customer_consent_records');
                return false;
            }
        }
        return true;
    }
    /**
     * Gets communication preferences for a customer.
     */
    static async getCustomerPreferences(customerId, organizationId) {
        const waRes = await query(`SELECT is_opted_in, preferred_language, opt_out_reason
       FROM whatsapp_customer_mappings
       WHERE customer_id = $1 AND organization_id = $2
       LIMIT 1;`, [customerId, organizationId]);
        const waOptIn = waRes.rows.length > 0 ? Boolean(waRes.rows[0].is_opted_in) : true;
        const prefLang = waRes.rows.length > 0 ? waRes.rows[0].preferred_language : 'mr';
        const optOutReason = waRes.rows[0]?.opt_out_reason || undefined;
        return {
            customerId,
            whatsappOptIn: waOptIn,
            pushOptIn: true,
            smsOptIn: true,
            preferredLanguage: prefLang,
            optOutReason,
        };
    }
    /**
     * Updates communication preferences (opt-in / opt-out) for a customer.
     */
    static async updateCustomerPreferences(customerId, organizationId, prefs) {
        const client = await query(`SELECT normalized_mobile_number, full_name FROM customers WHERE id = $1 AND organization_id = $2;`, [customerId, organizationId]);
        if (client.rows.length === 0) {
            throw new Error(`Customer '${customerId}' not found`);
        }
        const phone = client.rows[0].normalized_mobile_number;
        const isOptedIn = prefs.whatsappOptIn !== undefined ? prefs.whatsappOptIn : true;
        const lang = prefs.preferredLanguage || 'mr';
        await query(`INSERT INTO whatsapp_customer_mappings (
         organization_id, customer_id, phone_number, is_opted_in,
         preferred_language, opt_in_source, opt_in_timestamp,
         opt_out_timestamp, opt_out_reason, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'USER_PREFERENCE', NOW(),
         CASE WHEN $4::boolean = FALSE THEN NOW() ELSE NULL END,
         $6, NOW()
       )
       ON CONFLICT (organization_id, customer_id)
       DO UPDATE SET
         is_opted_in = EXCLUDED.is_opted_in,
         preferred_language = EXCLUDED.preferred_language,
         opt_out_timestamp = CASE WHEN EXCLUDED.is_opted_in = FALSE THEN NOW() ELSE NULL END,
         opt_out_reason = EXCLUDED.opt_out_reason,
         updated_at = NOW();`, [
            organizationId,
            customerId,
            phone,
            isOptedIn,
            lang,
            prefs.optOutReason || (isOptedIn ? null : 'Customer requested opt-out'),
        ]);
        // Also record in customer_consent_records for legal auditability
        await query(`INSERT INTO customer_consent_records (
         customer_id, consent_type, consent_granted,
         consent_text_version, consent_language, officer_id,
         recorded_at, revoked_at, revocation_reason
       ) VALUES (
         $1, 'COMMUNICATION_WHATSAPP', $2, 'v1.0', $3,
         (SELECT id FROM users WHERE organization_id = $4 LIMIT 1),
         NOW(), CASE WHEN $2::boolean = FALSE THEN NOW() ELSE NULL END, $5
       );`, [
            customerId,
            isOptedIn,
            lang,
            organizationId,
            prefs.optOutReason || (isOptedIn ? null : 'User preference update'),
        ]);
        return {
            customerId,
            whatsappOptIn: isOptedIn,
            pushOptIn: prefs.pushOptIn !== undefined ? prefs.pushOptIn : true,
            smsOptIn: prefs.smsOptIn !== undefined ? prefs.smsOptIn : true,
            preferredLanguage: lang,
            optOutReason: prefs.optOutReason,
        };
    }
}
//# sourceMappingURL=consent.service.js.map