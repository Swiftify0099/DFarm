-- Migration 016: Customer In-App Notifications Schema
-- Phase 18 Customer Mobile Application Integration

CREATE TABLE IF NOT EXISTS customer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL DEFAULT 'GENERAL_ANNOUNCEMENT',
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notification_type CHECK (
        notification_type IN (
            'MILK_COLLECTION',
            'BILL_GENERATED',
            'BILL_FINALIZED',
            'PAYMENT_DISBURSED',
            'PAYMENT_RECEIVED',
            'FEED_PURCHASE',
            'FEED_RETURN',
            'ADVANCE_APPROVED',
            'RATE_REVISED',
            'GENERAL_ANNOUNCEMENT'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_cust_notif_customer ON customer_notifications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cust_notif_unread ON customer_notifications(customer_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_cust_notif_org ON customer_notifications(organization_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_customer_notifications_updated_at ON customer_notifications;
CREATE TRIGGER set_customer_notifications_updated_at
BEFORE UPDATE ON customer_notifications
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Enable RLS
ALTER TABLE customer_notifications ENABLE ROW LEVEL SECURITY;

-- Customer can only view their own notifications
DROP POLICY IF EXISTS customer_view_own_notifications ON customer_notifications;
CREATE POLICY customer_view_own_notifications ON customer_notifications
    FOR SELECT
    USING (
        auth.uid() = customer_id 
        OR customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
    );

-- System / Service Role can insert & manage
DROP POLICY IF EXISTS service_manage_notifications ON customer_notifications;
CREATE POLICY service_manage_notifications ON customer_notifications
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);
