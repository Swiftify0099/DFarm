import { NotificationChannel, NotificationEventType } from '@dfarm/shared-types';
export interface RenderedMessage {
    title: string;
    body: string;
    whatsappTemplateName?: string;
    language: 'mr' | 'en';
}
export declare const CANONICAL_TEMPLATES: Record<string, Record<'mr' | 'en', {
    title: string;
    body: string;
    whatsappTemplateName?: string;
}>>;
export declare class TemplateEngine {
    /**
     * Renders a template with strict variable interpolation and localization.
     */
    static render(eventType: NotificationEventType, channel: NotificationChannel, language?: 'mr' | 'en', variables?: Record<string, unknown>, orgId?: string | null): Promise<RenderedMessage>;
    /**
     * Interpolate {{key}} tokens in text with values from dictionary.
     */
    static interpolate(template: string, vars: Record<string, string>): string;
    /**
     * Format numbers to 2 decimal places and ensure all values are stringified cleanly.
     */
    static formatVariables(raw: Record<string, unknown>): Record<string, string>;
}
//# sourceMappingURL=template.engine.d.ts.map