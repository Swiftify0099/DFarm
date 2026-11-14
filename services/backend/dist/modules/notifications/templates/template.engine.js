import { NotificationChannel, NotificationEventType } from '@dfarm/shared-types';
import { query } from '../../../db.js';
export const CANONICAL_TEMPLATES = {
    // 1. Milk Collection Receipt
    [`${NotificationEventType.MILK_COLLECTION_COMPLETED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'दूध संकलन पावती - {{centerName}}',
            body: 'नमस्कार {{customerName}},\n\nदिनांक: {{date}} ({{shift}})\nदूध प्रकार: {{milkCategory}}\nवजन: {{quantity}} किलो\nफॅट: {{fat}}% | एसएनएफ: {{snf}}%\nदर: ₹{{rate}}/किलो\nएकूण रक्कम: ₹{{totalAmount}}\nपावती क्र: {{receiptNumber}}\nनवीन शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_milk_collection_receipt_mr',
        },
        en: {
            title: 'Milk Collection Receipt - {{centerName}}',
            body: 'Dear {{customerName}},\n\nDate: {{date}} ({{shift}})\nMilk Category: {{milkCategory}}\nQuantity: {{quantity}} KG\nFat: {{fat}}% | SNF: {{snf}}%\nRate: ₹{{rate}}/KG\nTotal Amount: ₹{{totalAmount}}\nReceipt No: {{receiptNumber}}\nCurrent Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_milk_collection_receipt_en',
        },
    },
    [`${NotificationEventType.MILK_COLLECTION_COMPLETED}_${NotificationChannel.PUSH}`]: {
        mr: {
            title: 'दूध संकलन: ₹{{totalAmount}} जमा',
            body: '{{milkCategory}} दूध {{quantity}} किलो (फॅट {{fat}}%) नोंदवले गेले. पावती क्र: {{receiptNumber}}.',
        },
        en: {
            title: 'Milk Collection: ₹{{totalAmount}}',
            body: '{{milkCategory}} milk {{quantity}} KG (Fat {{fat}}%) recorded. Receipt No: {{receiptNumber}}.',
        },
    },
    [`${NotificationEventType.MILK_COLLECTION_COMPLETED}_${NotificationChannel.IN_APP}`]: {
        mr: {
            title: 'दूध संकलन पावती क्र: {{receiptNumber}}',
            body: 'दिनांक {{date}} ({{shift}}): {{quantity}} किलो {{milkCategory}} दूध संकलित. रक्कम: ₹{{totalAmount}}.',
        },
        en: {
            title: 'Milk Collection Receipt #{{receiptNumber}}',
            body: 'On {{date}} ({{shift}}): {{quantity}} KG of {{milkCategory}} milk collected. Total: ₹{{totalAmount}}.',
        },
    },
    // 2. Monthly Bill Generated
    [`${NotificationEventType.MONTHLY_BILL_GENERATED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'मासिक बिल तयार झाले - {{periodName}}',
            body: 'नमस्कार {{customerName}},\n\nआपले {{periodName}} कालावधीचे बिल तयार झाले आहे.\nबिल क्र: {{billNumber}}\nएकूण दूध वजन: {{totalMilkWeight}} किलो\nएकूण दूध रक्कम: ₹{{grossMilkAmount}}\nकपात (पशुखाद्य/अॅडव्हान्स): ₹{{totalDebits}}\nनिव्वळ देय रक्कम: ₹{{netPayableAmount}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_monthly_bill_mr',
        },
        en: {
            title: 'Monthly Bill Generated - {{periodName}}',
            body: 'Dear {{customerName}},\n\nYour monthly bill for {{periodName}} is ready.\nBill No: {{billNumber}}\nTotal Milk: {{totalMilkWeight}} KG\nGross Amount: ₹{{grossMilkAmount}}\nDeductions: ₹{{totalDebits}}\nNet Payable: ₹{{netPayableAmount}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_monthly_bill_en',
        },
    },
    [`${NotificationEventType.MONTHLY_BILL_GENERATED}_${NotificationChannel.PUSH}`]: {
        mr: {
            title: 'मासिक बिल तयार झाले: {{periodName}}',
            body: 'आपले मासिक बिल ₹{{netPayableAmount}} तयार झाले आहे. तपशील पहा.',
        },
        en: {
            title: 'Monthly Bill: {{periodName}}',
            body: 'Your monthly bill of ₹{{netPayableAmount}} is ready for review.',
        },
    },
    // 3. Statement Available
    [`${NotificationEventType.MONTHLY_BILL_STATEMENT_AVAILABLE}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'मासिक बिल विवरण पत्र उपलब्ध - {{periodName}}',
            body: 'नमस्कार {{customerName}},\n\nआपले {{periodName}} चे अधिकृत स्टेटमेंट उपलब्ध आहे. अंतिम देय रक्कम: ₹{{netPayableAmount}}.\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_monthly_bill_statement_mr',
        },
        en: {
            title: 'Monthly Statement Available - {{periodName}}',
            body: 'Dear {{customerName}},\n\nYour official settlement statement for {{periodName}} is now available. Net Payable: ₹{{netPayableAmount}}.\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_monthly_bill_statement_en',
        },
    },
    // 4. Payment Settled
    [`${NotificationEventType.PAYMENT_SETTLED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'पेमेंट जमा झाले - ₹{{amount}}',
            body: 'नमस्कार {{customerName}},\n\nआपल्या बँक खात्यात ₹{{amount}} यशस्वीरित्या जमा करण्यात आले आहेत.\nपद्धत: {{paymentMethod}}\nसंदर्भ क्र: {{referenceNumber}}\nखाते: {{bankAccountMask}}\nतारीख: {{settledDate}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_payment_settled_mr',
        },
        en: {
            title: 'Payment Settled - ₹{{amount}}',
            body: 'Dear {{customerName}},\n\nPayment of ₹{{amount}} has been successfully disbursed.\nMethod: {{paymentMethod}}\nRef No: {{referenceNumber}}\nAccount: {{bankAccountMask}}\nDate: {{settledDate}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_payment_settled_en',
        },
    },
    [`${NotificationEventType.PAYMENT_SETTLED}_${NotificationChannel.PUSH}`]: {
        mr: {
            title: 'पेमेंट जमा: ₹{{amount}}',
            body: '₹{{amount}} आपल्या खात्यात जमा केले आहेत. संदर्भ क्र: {{referenceNumber}}.',
        },
        en: {
            title: 'Payment Credited: ₹{{amount}}',
            body: 'Payment of ₹{{amount}} has been credited. Ref No: {{referenceNumber}}.',
        },
    },
    // 5. Payment Failed
    [`${NotificationEventType.PAYMENT_FAILED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'पेमेंट प्रक्रिया अयशस्वी - ₹{{amount}}',
            body: 'नमस्कार {{customerName}},\n\n₹{{amount}} चे पेमेंट अयशस्वी झाले आहे.\nकारण: {{failureReason}}\nसंदर्भ क्र: {{referenceNumber}}\nकृपया आपल्या डेअरी केंद्राशी संपर्क साधा.\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_payment_failed_mr',
        },
        en: {
            title: 'Payment Processing Failed - ₹{{amount}}',
            body: 'Dear {{customerName}},\n\nPayment disbursement of ₹{{amount}} could not be completed.\nReason: {{failureReason}}\nRef No: {{referenceNumber}}\nPlease contact your center manager.\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_payment_failed_en',
        },
    },
    [`${NotificationEventType.PAYMENT_FAILED}_${NotificationChannel.PUSH}`]: {
        mr: {
            title: 'पेमेंट अयशस्वी',
            body: '₹{{amount}} चे पेमेंट अयशस्वी झाले: {{failureReason}}',
        },
        en: {
            title: 'Payment Failed',
            body: 'Payment of ₹{{amount}} failed: {{failureReason}}',
        },
    },
    // 6. Feed Purchase Receipt
    [`${NotificationEventType.FEED_PURCHASE_COMPLETED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'पशुखाद्य खरेदी पावती - {{centerName}}',
            body: 'नमस्कार {{customerName}},\n\nपशुखाद्य खरेदी यशस्वीरित्या नोंदवली गेली.\nपावती क्र: {{receiptNumber}}\nवस्तू: {{productName}} ({{quantity}} {{unit}})\nदर: ₹{{unitPrice}} | एकूण: ₹{{totalAmount}}\nपेमेंट पद्धत: {{paymentMode}}\nखाते शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_feed_purchase_mr',
        },
        en: {
            title: 'Feed Purchase Receipt - {{centerName}}',
            body: 'Dear {{customerName}},\n\nFeed purchase recorded successfully.\nReceipt No: {{receiptNumber}}\nItem: {{productName}} ({{quantity}} {{unit}})\nRate: ₹{{unitPrice}} | Total: ₹{{totalAmount}}\nPayment Mode: {{paymentMode}}\nAccount Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_feed_purchase_en',
        },
    },
    [`${NotificationEventType.FEED_PURCHASE_COMPLETED}_${NotificationChannel.PUSH}`]: {
        mr: {
            title: 'पशुखाद्य खरेदी: ₹{{totalAmount}}',
            body: '{{productName}} खरेदी नोंदवली गेली. शिल्लक: ₹{{balance}}.',
        },
        en: {
            title: 'Feed Purchase: ₹{{totalAmount}}',
            body: '{{productName}} purchase recorded. Balance: ₹{{balance}}.',
        },
    },
    // 7. Customer Advance Recorded
    [`${NotificationEventType.CUSTOMER_ADVANCE_RECORDED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'आगाऊ रक्कम (Advance) मंजूर - ₹{{amount}}',
            body: 'नमस्कार {{customerName}},\n\nआपली ₹{{amount}} ची आगाऊ रक्कम मंजूर झाली आहे.\nशिल्लक आगाऊ रक्कम: ₹{{outstandingAdvance}}\nनवीन खाते शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_advance_recorded_mr',
        },
        en: {
            title: 'Advance Recorded - ₹{{amount}}',
            body: 'Dear {{customerName}},\n\nAdvance disbursement of ₹{{amount}} has been approved.\nTotal Outstanding Advance: ₹{{outstandingAdvance}}\nUpdated Account Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_advance_recorded_en',
        },
    },
    // 8. Customer Deduction Approved
    [`${NotificationEventType.CUSTOMER_DEDUCTION_APPROVED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'खाते कपात नोंदवली - ₹{{amount}}',
            body: 'नमस्कार {{customerName}},\n\nआपल्या खात्यातून ₹{{amount}} कपात नोंदवली गेली आहे ({{category}}).\nनवीन शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_deduction_approved_mr',
        },
        en: {
            title: 'Deduction Approved - ₹{{amount}}',
            body: 'Dear {{customerName}},\n\nA deduction of ₹{{amount}} ({{category}}) was recorded.\nCurrent Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_deduction_approved_en',
        },
    },
    // 9. Customer Repayment Received
    [`${NotificationEventType.CUSTOMER_REPAYMENT_RECEIVED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'परतफेड पावती - ₹{{amount}} प्राप्त',
            body: 'नमस्कार {{customerName}},\n\nआपल्याकडून ₹{{amount}} ची परतफेड यशस्वीरित्या प्राप्त झाली.\nपावती क्र: {{receiptNumber}}\nपद्धत: {{paymentMethod}}\nनवीन खाते शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_repayment_received_mr',
        },
        en: {
            title: 'Repayment Received - ₹{{amount}}',
            body: 'Dear {{customerName}},\n\nWe have received repayment of ₹{{amount}}.\nReceipt No: {{receiptNumber}}\nMethod: {{paymentMethod}}\nUpdated Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_repayment_received_en',
        },
    },
    // 10. Customer Registration & Onboarding Lifecycle
    [`${NotificationEventType.CUSTOMER_REGISTRATION_COMPLETED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'डीफार्म नोंदणी यशस्वी',
            body: 'नमस्कार {{customerName}},\n\nडीफार्म स्मार्ट डेअरी परिवारात आपले स्वागत आहे!\nआपला ग्राहक कोड: {{farmerCode}}\nकृपया चेहरा नोंदणी (Face Enrollment) पूर्ण करा.\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_registration_complete_mr',
        },
        en: {
            title: 'DFarm Registration Successful',
            body: 'Dear {{customerName}},\n\nWelcome to DFarm Smart Dairy!\nYour Farmer Code: {{farmerCode}}\nPlease complete your biometric face enrollment.\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_registration_complete_en',
        },
    },
    [`${NotificationEventType.CUSTOMER_ACCOUNT_ACTIVATED}_${NotificationChannel.WHATSAPP}`]: {
        mr: {
            title: 'खाते सक्रिय झाले - {{farmerCode}}',
            body: 'नमस्कार {{customerName}},\n\nआपले ग्राहक खाते यशस्वीरित्या सक्रिय झाले आहे (RFID कार्ड जोडले गेले).\nआता आपण दूध संकलन सुरू करू शकता.\n\nडीफार्म स्मार्ट डेअरी',
            whatsappTemplateName: 'dfarm_account_activated_mr',
        },
        en: {
            title: 'Account Activated - {{farmerCode}}',
            body: 'Dear {{customerName}},\n\nYour DFarm account is fully active and your RFID card is linked.\nYou may now deliver milk.\n\nDFarm Smart Dairy',
            whatsappTemplateName: 'dfarm_account_activated_en',
        },
    },
};
export class TemplateEngine {
    /**
     * Renders a template with strict variable interpolation and localization.
     */
    static async render(eventType, channel, language = 'mr', variables = {}, orgId) {
        const key = `${eventType}_${channel}`;
        // 1. Check database for tenant-customized template
        let titleTemplate = null;
        let bodyTemplate = null;
        let waTemplateName = null;
        if (orgId) {
            const res = await query(`SELECT title_template, body_template, whatsapp_template_name
         FROM notification_templates
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND template_code = $2
           AND channel = $3
           AND language = $4
           AND is_active = TRUE
         ORDER BY organization_id NULLS LAST
         LIMIT 1;`, [orgId, eventType, channel, language]);
            if (res.rows.length > 0) {
                titleTemplate = res.rows[0].title_template;
                bodyTemplate = res.rows[0].body_template;
                waTemplateName = res.rows[0].whatsapp_template_name;
            }
        }
        // 2. Fallback to canonical hardcoded templates
        if (!bodyTemplate) {
            const templateGroup = CANONICAL_TEMPLATES[key];
            const langTemplate = templateGroup ? templateGroup[language] || templateGroup['mr'] || templateGroup['en'] : null;
            if (langTemplate) {
                titleTemplate = langTemplate.title;
                bodyTemplate = langTemplate.body;
                waTemplateName = langTemplate.whatsappTemplateName ?? null;
            }
            else {
                // Universal fallback
                titleTemplate = `Notification: ${eventType}`;
                bodyTemplate = `Notification event ${eventType} for customer.`;
            }
        }
        // 3. Format variable values (sanitize amounts to 2 decimals, format dates)
        const sanitizedVars = this.formatVariables(variables);
        // 4. Interpolate {{variable}} tokens
        const title = this.interpolate(titleTemplate || '', sanitizedVars);
        const body = this.interpolate(bodyTemplate, sanitizedVars);
        return {
            title,
            body,
            whatsappTemplateName: waTemplateName || undefined,
            language,
        };
    }
    /**
     * Interpolate {{key}} tokens in text with values from dictionary.
     */
    static interpolate(template, vars) {
        return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
            return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
        });
    }
    /**
     * Format numbers to 2 decimal places and ensure all values are stringified cleanly.
     */
    static formatVariables(raw) {
        const out = {};
        for (const [key, val] of Object.entries(raw)) {
            if (val === null || val === undefined) {
                out[key] = '-';
            }
            else if (typeof val === 'number') {
                if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('rate') || key.toLowerCase().includes('balance') || key.toLowerCase().includes('advance') || key.toLowerCase().includes('debit') || key.toLowerCase().includes('credit')) {
                    out[key] = val.toFixed(2);
                }
                else if (key.toLowerCase().includes('fat') || key.toLowerCase().includes('snf') || key.toLowerCase().includes('quantity') || key.toLowerCase().includes('weight')) {
                    out[key] = val.toFixed(2);
                }
                else {
                    out[key] = String(val);
                }
            }
            else if (val instanceof Date) {
                out[key] = val.toISOString().split('T')[0] || '';
            }
            else {
                out[key] = String(val);
            }
        }
        return out;
    }
}
//# sourceMappingURL=template.engine.js.map