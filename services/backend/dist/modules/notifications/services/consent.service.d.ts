import { NotificationChannel, CommunicationPreferenceDTO } from '@dfarm/shared-types';
export declare class ConsentService {
    /**
     * Checks whether communication consent is actively granted for a customer and channel.
     * Checks both whatsapp_customer_mappings and customer_consent_records.
     */
    static isConsentGranted(customerId: string, channel: NotificationChannel, _organizationId?: string | null): Promise<boolean>;
    /**
     * Gets communication preferences for a customer.
     */
    static getCustomerPreferences(customerId: string, organizationId: string): Promise<CommunicationPreferenceDTO>;
    /**
     * Updates communication preferences (opt-in / opt-out) for a customer.
     */
    static updateCustomerPreferences(customerId: string, organizationId: string, prefs: Partial<CommunicationPreferenceDTO>): Promise<CommunicationPreferenceDTO>;
}
//# sourceMappingURL=consent.service.d.ts.map