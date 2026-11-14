-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 017: NOTIFICATION ENGINE, PUSH & WHATSAPP BUSINESS AUTOMATION
-- Durable Outbox, Multi-Channel Templates, Device Tokens & Provider Events
-- ==============================================================================

-- 1. Notification Templates Table (Configurable Multi-Lingual Templates)
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    template_code VARCHAR(100) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'mr',
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    whatsapp_template_name VARCHAR(100),
    whatsapp_namespace VARCHAR(100),
    variables_schema JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_template_channel CHECK (channel IN ('PUSH', 'WHATSAPP', 'IN_APP', 'SMS')),
    CONSTRAINT chk_template_language CHECK (language IN ('mr', 'en', 'hi')),
    CONSTRAINT uq_template_code_channel_lang UNIQUE (organization_id, template_code, channel, language)
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_code ON notification_templates(template_code, channel, language);
CREATE INDEX IF NOT EXISTS idx_notif_templates_org ON notification_templates(organization_id);

DROP TRIGGER IF EXISTS set_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER set_notification_templates_updated_at
BEFORE UPDATE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Durable Notification Outbox Records
CREATE TABLE IF NOT EXISTS notification_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    event_type VARCHAR(80) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    recipient_phone VARCHAR(30),
    recipient_token VARCHAR(512),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    last_attempted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notif_record_channel CHECK (channel IN ('PUSH', 'WHATSAPP', 'IN_APP', 'SMS')),
    CONSTRAINT chk_notif_record_status CHECK (status IN (
        'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED', 'OPTED_OUT', 'BLOCKED'
    )),
    CONSTRAINT uq_notif_record_event_channel UNIQUE (organization_id, event_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_records_customer ON notification_records(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_records_status ON notification_records(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notif_records_event ON notification_records(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_records_org ON notification_records(organization_id);

DROP TRIGGER IF EXISTS set_notification_records_updated_at ON notification_records;
CREATE TRIGGER set_notification_records_updated_at
BEFORE UPDATE ON notification_records
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 3. Notification Delivery Logs
CREATE TABLE IF NOT EXISTS notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_record_id UUID NOT NULL REFERENCES notification_records(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255),
    status VARCHAR(30) NOT NULL,
    response_code INT,
    response_payload JSONB,
    error_message TEXT,
    latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_record ON notification_delivery_logs(notification_record_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_provider_id ON notification_delivery_logs(provider_message_id);

-- 4. WhatsApp Customer Mappings (Consent, Preferred Language & Opt-In)
CREATE TABLE IF NOT EXISTS whatsapp_customer_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    phone_number VARCHAR(30) NOT NULL,
    whatsapp_id VARCHAR(64),
    is_opted_in BOOLEAN NOT NULL DEFAULT TRUE,
    opt_in_source VARCHAR(50) DEFAULT 'REGISTRATION_CONSENT',
    opt_in_timestamp TIMESTAMPTZ DEFAULT NOW(),
    opt_out_timestamp TIMESTAMPTZ,
    opt_out_reason TEXT,
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'mr',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wa_cust_map_org_cust UNIQUE (organization_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_map_cust ON whatsapp_customer_mappings(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_map_phone ON whatsapp_customer_mappings(organization_id, phone_number);

DROP TRIGGER IF EXISTS set_whatsapp_customer_mappings_updated_at ON whatsapp_customer_mappings;
CREATE TRIGGER set_whatsapp_customer_mappings_updated_at
BEFORE UPDATE ON whatsapp_customer_mappings
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 5. WhatsApp Message Records (Audit Trail & Status Updates)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    notification_record_id UUID REFERENCES notification_records(id) ON DELETE SET NULL,
    direction VARCHAR(20) NOT NULL DEFAULT 'OUTBOUND',
    wamid VARCHAR(255) UNIQUE,
    phone_number VARCHAR(30) NOT NULL,
    template_name VARCHAR(100),
    message_type VARCHAR(30) NOT NULL DEFAULT 'TEMPLATE',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    payload JSONB,
    error_code VARCHAR(50),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wa_msg_direction CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    CONSTRAINT chk_wa_msg_status CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_cust ON whatsapp_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_wamid ON whatsapp_messages(wamid);
CREATE INDEX IF NOT EXISTS idx_wa_messages_notif ON whatsapp_messages(notification_record_id);

DROP TRIGGER IF EXISTS set_whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER set_whatsapp_messages_updated_at
BEFORE UPDATE ON whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 6. Customer Device Tokens (Push Notifications via FCM)
CREATE TABLE IF NOT EXISTS customer_device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_id VARCHAR(128) NOT NULL,
    device_platform VARCHAR(20) NOT NULL DEFAULT 'ANDROID',
    fcm_token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_platform CHECK (device_platform IN ('ANDROID', 'IOS', 'WEB')),
    CONSTRAINT uq_customer_device_token UNIQUE (customer_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_cust_tokens_cust ON customer_device_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_tokens_active ON customer_device_tokens(customer_id, is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS set_customer_device_tokens_updated_at ON customer_device_tokens;
CREATE TRIGGER set_customer_device_tokens_updated_at
BEFORE UPDATE ON customer_device_tokens
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 7. Provider Event Records (Webhook Idempotency & Replay Protection)
CREATE TABLE IF NOT EXISTS provider_event_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    raw_payload JSONB NOT NULL,
    processed_status VARCHAR(30) NOT NULL DEFAULT 'PROCESSED',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_events_lookup ON provider_event_records(provider, event_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_customer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_event_records ENABLE ROW LEVEL SECURITY;

-- Service Role full access
DROP POLICY IF EXISTS service_role_notif_templates ON notification_templates;
DROP POLICY IF EXISTS service_role_notif_records ON notification_records;
DROP POLICY IF EXISTS service_role_notif_logs ON notification_delivery_logs;
DROP POLICY IF EXISTS service_role_wa_mappings ON whatsapp_customer_mappings;
DROP POLICY IF EXISTS service_role_wa_messages ON whatsapp_messages;
DROP POLICY IF EXISTS service_role_cust_tokens ON customer_device_tokens;
DROP POLICY IF EXISTS service_role_provider_events ON provider_event_records;
CREATE POLICY service_role_notif_templates ON notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_notif_records ON notification_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_notif_logs ON notification_delivery_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_wa_mappings ON whatsapp_customer_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_wa_messages ON whatsapp_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_cust_tokens ON customer_device_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_provider_events ON provider_event_records FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users: Tenant Isolation & Customer Self-Service
DROP POLICY IF EXISTS tenant_isolation_notif_templates ON notification_templates;
CREATE POLICY tenant_isolation_notif_templates ON notification_templates
FOR SELECT TO authenticated
USING (
    organization_id IS NULL OR organization_id = public.current_org_id()
);

DROP POLICY IF EXISTS tenant_isolation_notif_records ON notification_records;
CREATE POLICY tenant_isolation_notif_records ON notification_records
FOR SELECT TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR', 'ACCOUNTANT')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS customer_update_own_notif_read ON notification_records;
CREATE POLICY customer_update_own_notif_read ON notification_records
FOR UPDATE TO authenticated
USING (
    customer_id = public.current_customer_id()
)
WITH CHECK (
    customer_id = public.current_customer_id()
);

DROP POLICY IF EXISTS tenant_isolation_wa_mappings ON whatsapp_customer_mappings;
CREATE POLICY tenant_isolation_wa_mappings ON whatsapp_customer_mappings
FOR ALL TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

DROP POLICY IF EXISTS customer_manage_own_tokens ON customer_device_tokens;
CREATE POLICY customer_manage_own_tokens ON customer_device_tokens
FOR ALL TO authenticated
USING (
    customer_id = public.current_customer_id()
)
WITH CHECK (
    customer_id = public.current_customer_id()
);

DROP POLICY IF EXISTS tenant_isolation_wa_messages ON whatsapp_messages;
CREATE POLICY tenant_isolation_wa_messages ON whatsapp_messages
FOR SELECT TO authenticated
USING (
    organization_id = public.current_org_id()
    AND (
        public.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER')
        OR (public.current_user_role() = 'FARMER_CUSTOMER' AND customer_id = public.current_customer_id())
    )
);

-- ==============================================================================
-- SEED CANONICAL DEFAULT NOTIFICATION TEMPLATES (MARATHI & ENGLISH)
-- ==============================================================================

-- 1. Milk Collection Receipt (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MILK_COLLECTION_RECEIPT', 'WHATSAPP', 'mr',
    'दूध संकलन पावती - {{centerName}}',
    'नमस्कार {{customerName}},\n\nदिनांक: {{date}} ({{shift}})\nदूध प्रकार: {{milkCategory}}\nवजन: {{quantity}} किलो\nफॅट: {{fat}}% | एसएनएफ: {{snf}}%\nदर: ₹{{rate}}/किलो\nएकूण रक्कम: ₹{{totalAmount}}\nपावती क्र: {{receiptNumber}}\nनवीन शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_milk_collection_receipt_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 2. Milk Collection Receipt (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MILK_COLLECTION_RECEIPT', 'WHATSAPP', 'en',
    'Milk Collection Receipt - {{centerName}}',
    'Dear {{customerName}},\n\nDate: {{date}} ({{shift}})\nMilk Category: {{milkCategory}}\nQuantity: {{quantity}} KG\nFat: {{fat}}% | SNF: {{snf}}%\nRate: ₹{{rate}}/KG\nTotal Amount: ₹{{totalAmount}}\nReceipt No: {{receiptNumber}}\nCurrent Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
    'dfarm_milk_collection_receipt_en', TRUE
) ON CONFLICT DO NOTHING;

-- 3. Monthly Bill Generated (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MONTHLY_BILL', 'WHATSAPP', 'mr',
    'मासिक बिल तयार झाले - {{periodName}}',
    'नमस्कार {{customerName}},\n\nआपले {{periodName}} कालावधीचे बिल तयार झाले आहे.\nबिल क्र: {{billNumber}}\nएकूण दूध वजन: {{totalMilkWeight}} किलो\nएकूण दूध रक्कम: ₹{{grossMilkAmount}}\nकपात (पशुखाद्य/अॅडव्हान्स): ₹{{totalDebits}}\nनिव्वळ देय रक्कम: ₹{{netPayableAmount}}\n\nतपशीलवार विवरण मोबाईल ॲपवर उपलब्ध आहे.\nडीफार्म स्मार्ट डेअरी',
    'dfarm_monthly_bill_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 4. Monthly Bill Generated (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'MONTHLY_BILL', 'WHATSAPP', 'en',
    'Monthly Bill Generated - {{periodName}}',
    'Dear {{customerName}},\n\nYour monthly bill for {{periodName}} is ready.\nBill No: {{billNumber}}\nTotal Milk: {{totalMilkWeight}} KG\nGross Amount: ₹{{grossMilkAmount}}\nDeductions: ₹{{totalDebits}}\nNet Payable: ₹{{netPayableAmount}}\n\nDetailed statement is available on your customer app.\nDFarm Smart Dairy',
    'dfarm_monthly_bill_en', TRUE
) ON CONFLICT DO NOTHING;

-- 5. Payment Confirmation (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'PAYMENT_CONFIRMATION', 'WHATSAPP', 'mr',
    'पेमेंट जमा झाले - ₹{{amount}}',
    'नमस्कार {{customerName}},\n\nआपल्या बँक खात्यात ₹{{amount}} जमा करण्यात आले आहेत.\nपद्धत: {{paymentMethod}}\nसंदर्भ क्र: {{referenceNumber}}\nखाते: {{bankAccountMask}}\nतारीख: {{settledDate}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_payment_settled_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 6. Payment Confirmation (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'PAYMENT_CONFIRMATION', 'WHATSAPP', 'en',
    'Payment Settled - ₹{{amount}}',
    'Dear {{customerName}},\n\nPayment of ₹{{amount}} has been successfully disbursed.\nMethod: {{paymentMethod}}\nRef No: {{referenceNumber}}\nAccount: {{bankAccountMask}}\nDate: {{settledDate}}\n\nDFarm Smart Dairy',
    'dfarm_payment_settled_en', TRUE
) ON CONFLICT DO NOTHING;

-- 7. Feed Purchase Receipt (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'FEED_PURCHASE_RECEIPT', 'WHATSAPP', 'mr',
    'पशुखाद्य खरेदी पावती - {{centerName}}',
    'नमस्कार {{customerName}},\n\nपशुखाद्य खरेदी यशस्वीरित्या नोंदवली गेली.\nपावती क्र: {{receiptNumber}}\nवस्तू: {{productName}} ({{quantity}} {{unit}})\nदर: ₹{{unitPrice}} | एकूण: ₹{{totalAmount}}\nपेमेंट पद्धत: {{paymentMode}}\nखाते शिल्लक: ₹{{balance}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_feed_purchase_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 8. Feed Purchase Receipt (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'FEED_PURCHASE_RECEIPT', 'WHATSAPP', 'en',
    'Feed Purchase Receipt - {{centerName}}',
    'Dear {{customerName}},\n\nFeed purchase recorded successfully.\nReceipt No: {{receiptNumber}}\nItem: {{productName}} ({{quantity}} {{unit}})\nRate: ₹{{unitPrice}} | Total: ₹{{totalAmount}}\nPayment Mode: {{paymentMode}}\nAccount Balance: ₹{{balance}}\n\nDFarm Smart Dairy',
    'dfarm_feed_purchase_en', TRUE
) ON CONFLICT DO NOTHING;

-- 9. Customer Account Summary (Marathi)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'CUSTOMER_ACCOUNT_SUMMARY', 'WHATSAPP', 'mr',
    'खाते सारांश - {{customerName}}',
    'नमस्कार {{customerName}} (कोड: {{farmerCode}}),\n\nसध्याची शिल्लक: ₹{{balance}}\nचालू महिन्यातील एकूण दूध: {{totalMilkWeight}} किलो\nथकीत आगाऊ रक्कम (Advance): ₹{{outstandingAdvance}}\n\nडीफार्म स्मार्ट डेअरी',
    'dfarm_account_summary_mr', TRUE
) ON CONFLICT DO NOTHING;

-- 10. Customer Account Summary (English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, whatsapp_template_name, is_active
) VALUES (
    NULL, 'CUSTOMER_ACCOUNT_SUMMARY', 'WHATSAPP', 'en',
    'Account Summary - {{customerName}}',
    'Dear {{customerName}} (Code: {{farmerCode}}),\n\nCurrent Balance: ₹{{balance}}\nMonth Milk Total: {{totalMilkWeight}} KG\nOutstanding Advance: ₹{{outstandingAdvance}}\n\nDFarm Smart Dairy',
    'dfarm_account_summary_en', TRUE
) ON CONFLICT DO NOTHING;

-- 11. Push Notification Templates (Marathi & English)
INSERT INTO notification_templates (
    organization_id, template_code, channel, language, title_template, body_template, is_active
) VALUES 
(NULL, 'MILK_COLLECTION_RECEIPT', 'PUSH', 'mr', 'दूध संकलन: ₹{{totalAmount}} जमा', '{{milkCategory}} दूध {{quantity}} किलो (फॅट {{fat}}%) नोंदवले गेले. पावती: {{receiptNumber}}.', TRUE),
(NULL, 'MILK_COLLECTION_RECEIPT', 'PUSH', 'en', 'Milk Collection: ₹{{totalAmount}}', '{{milkCategory}} milk {{quantity}} KG (Fat {{fat}}%) recorded. Receipt: {{receiptNumber}}.', TRUE),
(NULL, 'MONTHLY_BILL', 'PUSH', 'mr', 'मासिक बिल: {{periodName}}', 'आपले मासिक बिल ₹{{netPayableAmount}} तयार झाले आहे.', TRUE),
(NULL, 'MONTHLY_BILL', 'PUSH', 'en', 'Monthly Bill: {{periodName}}', 'Your monthly bill of ₹{{netPayableAmount}} is ready for review.', TRUE),
(NULL, 'PAYMENT_CONFIRMATION', 'PUSH', 'mr', 'पेमेंट यशस्वी: ₹{{amount}}', '₹{{amount}} आपल्या बँक खात्यात जमा केले आहेत.', TRUE),
(NULL, 'PAYMENT_CONFIRMATION', 'PUSH', 'en', 'Payment Settled: ₹{{amount}}', 'Payment of ₹{{amount}} has been credited to your account.', TRUE),
(NULL, 'FEED_PURCHASE_RECEIPT', 'PUSH', 'mr', 'पशुखाद्य खरेदी: ₹{{totalAmount}}', '{{productName}} खरेदी नोंदवली गेली. शिल्लक: ₹{{balance}}.', TRUE),
(NULL, 'FEED_PURCHASE_RECEIPT', 'PUSH', 'en', 'Feed Purchase: ₹{{totalAmount}}', '{{productName}} purchase recorded. Balance: ₹{{balance}}.', TRUE),
(NULL, 'PAYMENT_FAILED', 'PUSH', 'mr', 'पेमेंट अयशस्वी', '₹{{amount}} चे पेमेंट अयशस्वी झाले: {{failureReason}}', TRUE),
(NULL, 'PAYMENT_FAILED', 'PUSH', 'en', 'Payment Failed', 'Payment of ₹{{amount}} failed: {{failureReason}}', TRUE),
(NULL, 'CUSTOMER_REGISTRATION_COMPLETED', 'PUSH', 'mr', 'नोंदणी पूर्ण झाली', 'डीफार्म परिवारात आपले स्वागत आहे! ग्राहक कोड: {{farmerCode}}.', TRUE),
(NULL, 'CUSTOMER_REGISTRATION_COMPLETED', 'PUSH', 'en', 'Registration Complete', 'Welcome to DFarm! Your farmer code is {{farmerCode}}.', TRUE)
ON CONFLICT DO NOTHING;
