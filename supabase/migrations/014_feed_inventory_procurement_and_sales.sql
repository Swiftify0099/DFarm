-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 014: CATTLE FEED INVENTORY, PROCUREMENT, CUSTOMER SALES & STOCK ACCOUNTING
-- ==============================================================================

-- 1. Ensure DAIRY_ADMIN is in users.role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_role;
ALTER TABLE users ADD CONSTRAINT chk_user_role CHECK (role IN (
    'SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR',
    'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'REGISTRATION_OFFICER', 'FARMER_CUSTOMER'
));

-- 2. Feed Category Management
CREATE TABLE IF NOT EXISTS feed_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feed_categories_org_code UNIQUE (organization_id, code)
);

CREATE TRIGGER set_feed_categories_updated_at
BEFORE UPDATE ON feed_categories
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_categories_org ON feed_categories(organization_id);

-- 3. Feed Product Catalog
CREATE TABLE IF NOT EXISTS feed_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES feed_categories(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    base_unit VARCHAR(20) NOT NULL DEFAULT 'KG',
    pack_size NUMERIC(10,3) NOT NULL DEFAULT 1.000,
    pack_unit VARCHAR(20) NOT NULL DEFAULT 'KG',
    default_purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10,2) NOT NULL,
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    hsn_code VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    minimum_stock_level NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    weighted_avg_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feed_products_org_code UNIQUE (organization_id, code),
    CONSTRAINT chk_feed_product_selling_price CHECK (selling_price >= 0.00),
    CONSTRAINT chk_feed_product_purchase_price CHECK (default_purchase_price >= 0.00),
    CONSTRAINT chk_feed_product_pack_size CHECK (pack_size > 0.000),
    CONSTRAINT chk_feed_product_tax_rate CHECK (tax_rate_percent >= 0.00 AND tax_rate_percent <= 100.00),
    CONSTRAINT chk_feed_product_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    CONSTRAINT chk_feed_product_base_unit CHECK (base_unit IN ('KG', 'BAG', 'PIECE', 'LITRE'))
);

CREATE TRIGGER set_feed_products_updated_at
BEFORE UPDATE ON feed_products
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_products_org ON feed_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_feed_products_category ON feed_products(category_id);

-- 4. Supplier Management
CREATE TABLE IF NOT EXISTS feed_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    supplier_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    gst_number VARCHAR(30),
    pan_number VARCHAR(30),
    outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feed_suppliers_org_code UNIQUE (organization_id, supplier_code),
    CONSTRAINT chk_feed_supplier_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED'))
);

CREATE TRIGGER set_feed_suppliers_updated_at
BEFORE UPDATE ON feed_suppliers
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_suppliers_org ON feed_suppliers(organization_id);

-- 5. Center-Wise Product Inventory
CREATE TABLE IF NOT EXISTS center_product_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    current_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    reserved_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    reorder_threshold NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    last_movement_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_center_product_inventory UNIQUE (center_id, product_id),
    CONSTRAINT chk_center_product_current_stock CHECK (current_stock >= 0.000),
    CONSTRAINT chk_center_product_reserved_stock CHECK (reserved_stock >= 0.000)
);

CREATE TRIGGER set_center_product_inventory_updated_at
BEFORE UPDATE ON center_product_inventory
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_center_product_inv_center ON center_product_inventory(center_id);
CREATE INDEX IF NOT EXISTS idx_center_product_inv_product ON center_product_inventory(product_id);

-- 6. Feed Purchases (Procurement Header)
CREATE TABLE IF NOT EXISTS feed_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES feed_suppliers(id) ON DELETE RESTRICT,
    purchase_order_number VARCHAR(100),
    supplier_invoice_number VARCHAR(100) NOT NULL,
    purchase_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    received_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_feed_purchase_status CHECK (status IN ('ORDERED', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT chk_feed_purchase_amounts CHECK (subtotal >= 0.00 AND tax_amount >= 0.00 AND total_amount >= 0.00)
);

CREATE TRIGGER set_feed_purchases_updated_at
BEFORE UPDATE ON feed_purchases
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_purchases_org ON feed_purchases(organization_id);
CREATE INDEX IF NOT EXISTS idx_feed_purchases_center ON feed_purchases(center_id);
CREATE INDEX IF NOT EXISTS idx_feed_purchases_supplier ON feed_purchases(supplier_id);

-- 7. Feed Purchase Items (Procurement Details)
CREATE TABLE IF NOT EXISTS feed_purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES feed_purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    unit_cost NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0.00),
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0.00),
    batch_number VARCHAR(100),
    expiry_date DATE
);

CREATE INDEX IF NOT EXISTS idx_feed_purchase_items_purchase ON feed_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_feed_purchase_items_product ON feed_purchase_items(product_id);

-- 8. Append-Only Stock Movements Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(40) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    quantity_delta NUMERIC(12,3) NOT NULL,
    base_unit VARCHAR(20) NOT NULL,
    balance_after NUMERIC(12,3) NOT NULL CHECK (balance_after >= 0.000),
    unit_cost NUMERIC(10,2),
    reference_transaction_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    batch_number VARCHAR(100),
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    movement_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    CONSTRAINT chk_stock_movement_direction CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT chk_stock_movement_type CHECK (movement_type IN (
        'PURCHASE_RECEIPT', 'CUSTOMER_SALE', 'CUSTOMER_RETURN',
        'SUPPLIER_RETURN', 'DAMAGED_WRITE_OFF', 'STOCK_CORRECTION',
        'CENTER_TRANSFER'
    )),
    CONSTRAINT chk_stock_movement_ref_type CHECK (reference_transaction_type IN (
        'FEED_PURCHASE', 'FEED_SALE', 'FEED_RETURN',
        'INVENTORY_ADJUSTMENT', 'CENTER_TRANSFER'
    ))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_center ON stock_movements(center_id, movement_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, movement_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_idemp ON stock_movements(idempotency_key);

-- 9. Feed Sales Header
CREATE TABLE IF NOT EXISTS feed_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'CREDIT',
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    discount_approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    client_sale_uuid UUID,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCED',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_feed_sale_payment_mode CHECK (payment_mode IN ('CREDIT', 'CASH')),
    CONSTRAINT chk_feed_sale_status CHECK (status IN ('COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED')),
    CONSTRAINT chk_feed_sale_sync_status CHECK (sync_status IN ('SYNCED', 'PENDING_SYNC', 'CONFLICT')),
    CONSTRAINT chk_feed_sale_amounts CHECK (subtotal >= 0.00 AND discount_amount >= 0.00 AND tax_amount >= 0.00 AND total_amount >= 0.00)
);

CREATE TRIGGER set_feed_sales_updated_at
BEFORE UPDATE ON feed_sales
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_sales_org ON feed_sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_feed_sales_center ON feed_sales(center_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_sales_customer ON feed_sales(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_sales_idemp ON feed_sales(idempotency_key);

-- 10. Feed Sale Items
CREATE TABLE IF NOT EXISTS feed_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES feed_sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0.00),
    tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_feed_sale_items_sale ON feed_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_feed_sale_items_product ON feed_sale_items(product_id);

-- 11. Feed Returns
CREATE TABLE IF NOT EXISTS feed_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES feed_sales(id) ON DELETE RESTRICT,
    sale_item_id UUID NOT NULL REFERENCES feed_sale_items(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    return_quantity NUMERIC(12,3) NOT NULL CHECK (return_quantity > 0.000),
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    credit_amount NUMERIC(10,2) NOT NULL CHECK (credit_amount > 0.00),
    stock_condition VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stock_movement_id UUID REFERENCES stock_movements(id) ON DELETE RESTRICT,
    ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_feed_return_condition CHECK (stock_condition IN ('SALEABLE', 'DAMAGED'))
);

CREATE INDEX IF NOT EXISTS idx_feed_returns_sale ON feed_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_feed_returns_customer ON feed_returns(customer_id);

-- 12. Center Inventory Transfers
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    source_center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    destination_center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    unit VARCHAR(20) NOT NULL,
    base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0.000),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    source_movement_id UUID REFERENCES stock_movements(id),
    destination_movement_id UUID REFERENCES stock_movements(id),
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    CONSTRAINT chk_inv_transfer_diff_centers CHECK (source_center_id <> destination_center_id),
    CONSTRAINT chk_inv_transfer_status CHECK (status IN ('COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_inv_transfers_source ON inventory_transfers(source_center_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_dest ON inventory_transfers(destination_center_id);

-- 13. Inventory Adjustments & Write-offs
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES feed_products(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(40) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0.000),
    direction VARCHAR(10) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stock_movement_id UUID REFERENCES stock_movements(id),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_inv_adj_direction CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT chk_inv_adj_type CHECK (adjustment_type IN ('DAMAGED_WRITE_OFF', 'STOCK_CORRECTION', 'PHYSICAL_AUDIT_SURPLUS', 'PHYSICAL_AUDIT_DEFICIT'))
);

CREATE INDEX IF NOT EXISTS idx_inv_adj_center ON inventory_adjustments(center_id);

-- ==============================================================================
-- 14. STORED PROCEDURES & BUSINESS WORKFLOWS
-- ==============================================================================

-- A. Authorize and Receive Stock for a Feed Purchase
CREATE OR REPLACE FUNCTION public.receive_feed_purchase(
    p_purchase_id UUID,
    p_received_by UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_purchase RECORD;
    v_item RECORD;
    v_product RECORD;
    v_receiver RECORD;
    v_curr_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_new_wac NUMERIC(10,2);
    v_movement_id UUID;
    v_result JSONB;
BEGIN
    -- Check idempotency
    SELECT * INTO v_purchase FROM feed_purchases WHERE id = p_purchase_id;
    IF v_purchase.id IS NULL THEN
        RAISE EXCEPTION 'Purchase % does not exist', p_purchase_id USING ERRCODE = 'P0002';
    END IF;

    IF v_purchase.status = 'RECEIVED' THEN
        SELECT jsonb_build_object(
            'purchaseId', v_purchase.id,
            'status', v_purchase.status,
            'supplierInvoiceNumber', v_purchase.supplier_invoice_number,
            'totalAmount', v_purchase.total_amount,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- Verify receiver exists and is authorized staff
    SELECT * INTO v_receiver FROM users WHERE id = p_received_by;
    IF v_receiver.id IS NULL OR v_receiver.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Receiver % is not an active staff user', p_received_by USING ERRCODE = '22000';
    END IF;

    IF v_receiver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'INVENTORY_MANAGER', 'CENTER_MANAGER') THEN
        RAISE EXCEPTION 'User % with role % is not authorized to receive stock purchases', p_received_by, v_receiver.role USING ERRCODE = '42501';
    END IF;

    -- Process each item and update stock atomically
    FOR v_item IN SELECT * FROM feed_purchase_items WHERE purchase_id = p_purchase_id LOOP
        SELECT * INTO v_product FROM feed_products WHERE id = v_item.product_id;

        -- Ensure inventory row exists with FOR UPDATE
        INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, reserved_stock, reorder_threshold)
        VALUES (v_purchase.organization_id, v_purchase.center_id, v_item.product_id, 0.000, 0.000, v_product.minimum_stock_level)
        ON CONFLICT (center_id, product_id) DO NOTHING;

        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = v_purchase.center_id AND product_id = v_item.product_id 
        FOR UPDATE;

        v_new_stock := v_curr_stock + v_item.base_quantity;

        UPDATE center_product_inventory
        SET current_stock = v_new_stock,
            last_movement_at = NOW(),
            updated_at = NOW()
        WHERE center_id = v_purchase.center_id AND product_id = v_item.product_id;

        -- Record stock movement
        v_movement_id := gen_random_uuid();
        INSERT INTO stock_movements (
            id,
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            batch_number,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp
        ) VALUES (
            v_movement_id,
            v_purchase.organization_id,
            v_purchase.center_id,
            v_item.product_id,
            'PURCHASE_RECEIPT',
            'IN',
            v_item.base_quantity,
            v_item.base_quantity,
            v_product.base_unit,
            v_new_stock,
            v_item.unit_cost,
            'FEED_PURCHASE',
            p_purchase_id,
            v_item.batch_number,
            p_received_by,
            p_received_by,
            p_idempotency_key || '_' || v_item.id::text,
            NOW()
        );

        -- Update Weighted Average Cost (WAC)
        IF (v_curr_stock + v_item.base_quantity) > 0 THEN
            v_new_wac := ROUND(((v_curr_stock * v_product.weighted_avg_cost) + (v_item.base_quantity * v_item.unit_cost)) / (v_curr_stock + v_item.base_quantity), 2);
        ELSE
            v_new_wac := v_item.unit_cost;
        END IF;

        UPDATE feed_products
        SET weighted_avg_cost = v_new_wac,
            updated_at = NOW()
        WHERE id = v_item.product_id;
    END LOOP;

    -- Update purchase status
    UPDATE feed_purchases
    SET status = 'RECEIVED',
        received_by = p_received_by,
        received_at = NOW(),
        updated_at = NOW()
    WHERE id = p_purchase_id;

    -- Update supplier outstanding balance
    UPDATE feed_suppliers
    SET outstanding_balance = outstanding_balance + v_purchase.total_amount,
        updated_at = NOW()
    WHERE id = v_purchase.supplier_id;

    -- Emit sync event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        v_purchase.organization_id,
        v_purchase.center_id,
        'FEED_PURCHASE',
        p_purchase_id,
        'UPDATE',
        jsonb_build_object(
            'id', p_purchase_id,
            'status', 'RECEIVED',
            'receivedBy', p_received_by,
            'totalAmount', v_purchase.total_amount
        )
    );

    SELECT jsonb_build_object(
        'purchaseId', p_purchase_id,
        'status', 'RECEIVED',
        'supplierInvoiceNumber', v_purchase.supplier_invoice_number,
        'totalAmount', v_purchase.total_amount,
        'receivedAt', NOW(),
        'receivedBy', p_received_by,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- B. Process Customer Feed Sale with Atomic Stock & Customer Ledger Debit
CREATE OR REPLACE FUNCTION public.process_customer_feed_sale(
    p_organization_id UUID,
    p_center_id UUID,
    p_customer_id UUID,
    p_operator_id UUID,
    p_payment_mode VARCHAR(20),
    p_items JSONB,
    p_discount_amount NUMERIC(10,2),
    p_discount_approved_by UUID,
    p_idempotency_key VARCHAR(128),
    p_client_sale_uuid UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_existing_sale RECORD;
    v_customer RECORD;
    v_center RECORD;
    v_operator RECORD;
    v_approver RECORD;
    v_item JSONB;
    v_product RECORD;
    v_curr_stock NUMERIC(12,3);
    v_base_qty NUMERIC(12,3);
    v_item_subtotal NUMERIC(12,2);
    v_item_tax NUMERIC(10,2);
    v_item_total NUMERIC(12,2);
    v_sale_subtotal NUMERIC(12,2) := 0.00;
    v_sale_tax NUMERIC(12,2) := 0.00;
    v_sale_total NUMERIC(12,2) := 0.00;
    v_invoice_num VARCHAR(50);
    v_receipt_num VARCHAR(50);
    v_balance_after NUMERIC(12,3);
    v_ledger_account RECORD;
    v_cust_balance_after NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_sale FROM feed_sales WHERE idempotency_key = p_idempotency_key;
    IF v_existing_sale.id IS NULL AND p_client_sale_uuid IS NOT NULL THEN
        SELECT * INTO v_existing_sale FROM feed_sales WHERE id = p_client_sale_uuid;
    END IF;

    IF v_existing_sale.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'saleId', v_existing_sale.id,
            'invoiceNumber', v_existing_sale.invoice_number,
            'receiptNumber', v_existing_sale.receipt_number,
            'customerId', v_existing_sale.customer_id,
            'totalAmount', v_existing_sale.total_amount,
            'status', v_existing_sale.status,
            'paymentMode', v_existing_sale.payment_mode,
            'ledgerTransactionId', v_existing_sale.ledger_transaction_id,
            'isIdempotentReplay', TRUE,
            'completedAt', v_existing_sale.created_at
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Customer
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer % does not exist', p_customer_id USING ERRCODE = 'P0002';
    END IF;
    IF v_customer.is_deleted = TRUE THEN
        RAISE EXCEPTION 'Customer % is soft-deleted and cannot make purchases', p_customer_id USING ERRCODE = '22000';
    END IF;
    IF v_customer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Customer % is not ACTIVE (status: %)', p_customer_id, v_customer.status USING ERRCODE = '22000';
    END IF;
    IF v_customer.organization_id <> p_organization_id THEN
        RAISE EXCEPTION 'Customer organization mismatch' USING ERRCODE = '22000';
    END IF;

    -- 3. Verify Center
    SELECT * INTO v_center FROM dairy_centers WHERE id = p_center_id;
    IF v_center.id IS NULL OR v_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Center % is not active or does not exist', p_center_id USING ERRCODE = '22000';
    END IF;
    IF v_center.organization_id <> p_organization_id THEN
        RAISE EXCEPTION 'Center organization mismatch' USING ERRCODE = '22000';
    END IF;

    -- 4. Verify Operator
    SELECT * INTO v_operator FROM users WHERE id = p_operator_id;
    IF v_operator.id IS NULL OR v_operator.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Operator % is not active', p_operator_id USING ERRCODE = '22000';
    END IF;

    -- 5. Verify Discount Authorization
    IF COALESCE(p_discount_amount, 0.00) > 0.00 THEN
        IF p_discount_approved_by IS NULL THEN
            RAISE EXCEPTION 'Discount amount % requires manager or owner approval', p_discount_amount USING ERRCODE = '42501';
        END IF;

        SELECT * INTO v_approver FROM users WHERE id = p_discount_approved_by;
        IF v_approver.id IS NULL OR v_approver.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Discount approver % is not active', p_discount_approved_by USING ERRCODE = '22000';
        END IF;
        IF v_approver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER') THEN
            RAISE EXCEPTION 'User % with role % is not authorized to approve feed discounts', p_discount_approved_by, v_approver.role USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 6. Pass 1: Verify Items, Explicit Unit Conversions & Negative Stock Rejection
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Feed sale must contain at least one item' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO v_product FROM feed_products WHERE id = (v_item ->> 'productId')::UUID;
        IF v_product.id IS NULL THEN
            RAISE EXCEPTION 'Product % does not exist', v_item ->> 'productId' USING ERRCODE = 'P0002';
        END IF;
        IF v_product.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Product % is not ACTIVE (status: %)', v_product.name, v_product.status USING ERRCODE = '22000';
        END IF;
        IF v_product.organization_id <> p_organization_id THEN
            RAISE EXCEPTION 'Product % organization mismatch', v_product.name USING ERRCODE = '22000';
        END IF;

        -- Explicit Unit Conversion
        IF (v_item ->> 'unit') = v_product.base_unit THEN
            v_base_qty := (v_item ->> 'quantity')::NUMERIC;
        ELSIF (v_item ->> 'unit') = v_product.pack_unit THEN
            v_base_qty := (v_item ->> 'quantity')::NUMERIC * v_product.pack_size;
        ELSE
            RAISE EXCEPTION 'Invalid unit % for product %. Must be % or %', (v_item ->> 'unit'), v_product.name, v_product.base_unit, v_product.pack_unit USING ERRCODE = '22023';
        END IF;

        IF v_base_qty <= 0.000 THEN
            RAISE EXCEPTION 'Invalid quantity % for product %', v_base_qty, v_product.name USING ERRCODE = '22003';
        END IF;

        -- Lock center inventory and strictly enforce Negative Stock Policy
        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = p_center_id AND product_id = v_product.id 
        FOR UPDATE;

        IF v_curr_stock IS NULL OR v_curr_stock < v_base_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product % at center % (Available: %, Requested: %)', 
                v_product.name, v_center.name, COALESCE(v_curr_stock, 0.000), v_base_qty 
                USING ERRCODE = '22000';
        END IF;

        -- Calculate amounts with price snapshot
        v_item_subtotal := ROUND(((v_item ->> 'quantity')::NUMERIC * v_product.selling_price) - COALESCE((v_item ->> 'discountAmount')::NUMERIC, 0.00), 2);
        v_item_tax := ROUND(v_item_subtotal * (v_product.tax_rate_percent / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;

        v_sale_subtotal := v_sale_subtotal + v_item_subtotal;
        v_sale_tax := v_sale_tax + v_item_tax;
    END LOOP;

    v_sale_total := v_sale_subtotal + v_sale_tax - COALESCE(p_discount_amount, 0.00);
    IF v_sale_total < 0.00 THEN
        v_sale_total := 0.00;
    END IF;

    -- 7. Generate Identifiers
    v_sale_id := COALESCE(p_client_sale_uuid, gen_random_uuid());
    v_invoice_num := 'INV-FEED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_sale_id::text, 1, 8));
    v_receipt_num := 'RCP-FEED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_sale_id::text, 1, 8));

    -- 8. Insert Feed Sale Header
    INSERT INTO feed_sales (
        id,
        organization_id,
        center_id,
        customer_id,
        invoice_number,
        receipt_number,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        payment_mode,
        status,
        discount_approved_by,
        idempotency_key,
        client_sale_uuid,
        created_by,
        created_at
    ) VALUES (
        v_sale_id,
        p_organization_id,
        p_center_id,
        p_customer_id,
        v_invoice_num,
        v_receipt_num,
        v_sale_subtotal,
        COALESCE(p_discount_amount, 0.00),
        v_sale_tax,
        v_sale_total,
        p_payment_mode,
        'COMPLETED',
        p_discount_approved_by,
        p_idempotency_key,
        p_client_sale_uuid,
        p_operator_id,
        NOW()
    );

    -- 9. Pass 2: Deduct Stock & Insert Sale Items & Stock Movements
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO v_product FROM feed_products WHERE id = (v_item ->> 'productId')::UUID;

        IF (v_item ->> 'unit') = v_product.base_unit THEN
            v_base_qty := (v_item ->> 'quantity')::NUMERIC;
        ELSE
            v_base_qty := (v_item ->> 'quantity')::NUMERIC * v_product.pack_size;
        END IF;

        v_item_subtotal := ROUND(((v_item ->> 'quantity')::NUMERIC * v_product.selling_price) - COALESCE((v_item ->> 'discountAmount')::NUMERIC, 0.00), 2);
        v_item_tax := ROUND(v_item_subtotal * (v_product.tax_rate_percent / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;

        -- Deduct from center inventory
        UPDATE center_product_inventory
        SET current_stock = current_stock - v_base_qty,
            last_movement_at = NOW(),
            updated_at = NOW()
        WHERE center_id = p_center_id AND product_id = v_product.id
        RETURNING current_stock INTO v_balance_after;

        -- Insert item record
        INSERT INTO feed_sale_items (
            sale_id,
            product_id,
            quantity,
            unit,
            base_quantity,
            unit_price,
            tax_rate_percent,
            tax_amount,
            discount_amount,
            total_amount
        ) VALUES (
            v_sale_id,
            v_product.id,
            (v_item ->> 'quantity')::NUMERIC,
            (v_item ->> 'unit'),
            v_base_qty,
            v_product.selling_price,
            v_product.tax_rate_percent,
            v_item_tax,
            COALESCE((v_item ->> 'discountAmount')::NUMERIC, 0.00),
            v_item_total
        );

        -- Insert append-only stock movement
        INSERT INTO stock_movements (
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp
        ) VALUES (
            p_organization_id,
            p_center_id,
            v_product.id,
            'CUSTOMER_SALE',
            'OUT',
            v_base_qty,
            -v_base_qty,
            v_product.base_unit,
            v_balance_after,
            v_product.weighted_avg_cost,
            'FEED_SALE',
            v_sale_id,
            p_operator_id,
            p_operator_id,
            p_idempotency_key || '_' || v_product.id::text,
            NOW()
        );
    END LOOP;

    -- 10. Customer Credit Ledger Integration (Debit Customer Balance)
    IF p_payment_mode = 'CREDIT' AND v_sale_total > 0.00 THEN
        -- Lock or create customer ledger account
        INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
        VALUES (p_customer_id, p_organization_id, 'INR', 0.00)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_ledger_account 
        FROM customer_ledger_accounts 
        WHERE customer_id = p_customer_id 
        FOR UPDATE;

        -- In DFarm accounting, DEBIT reduces farmer payable balance (farmer owes dairy)
        v_cust_balance_after := v_ledger_account.current_balance - v_sale_total;

        UPDATE customer_ledger_accounts
        SET current_balance = v_cust_balance_after,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE customer_id = p_customer_id;

        -- Record ledger transaction
        v_ledger_txn_id := gen_random_uuid();
        INSERT INTO ledger_transactions (
            id,
            organization_id,
            center_id,
            customer_id,
            transaction_type,
            direction,
            amount,
            balance_after,
            reference_entity,
            reference_id,
            description,
            idempotency_key,
            created_by,
            created_at
        ) VALUES (
            v_ledger_txn_id,
            p_organization_id,
            p_center_id,
            p_customer_id,
            'FEED_PURCHASE_DEBIT',
            'DEBIT',
            v_sale_total,
            v_cust_balance_after,
            'FEED_SALE',
            v_sale_id,
            'Cattle feed credit purchase: ' || v_invoice_num,
            p_idempotency_key || '_ledger',
            p_operator_id,
            NOW()
        );

        -- Double-entry balanced journal entries
        -- 1. DEBIT Customer Payable (liability reduction / farmer receivable)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            p_customer_id,
            'CUSTOMER_PAYABLE',
            'DEBIT',
            v_sale_total
        );

        -- 2. CREDIT Feed Inventory (asset reduction / store inventory)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            p_center_id,
            'FEED_INVENTORY',
            'CREDIT',
            v_sale_total
        );

        UPDATE feed_sales
        SET ledger_transaction_id = v_ledger_txn_id
        WHERE id = v_sale_id;
    END IF;

    -- 11. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_center_id,
        'FEED_SALE',
        v_sale_id,
        'INSERT',
        jsonb_build_object(
            'id', v_sale_id,
            'invoiceNumber', v_invoice_num,
            'receiptNumber', v_receipt_num,
            'customerId', p_customer_id,
            'totalAmount', v_sale_total,
            'paymentMode', p_payment_mode
        )
    );

    SELECT jsonb_build_object(
        'saleId', v_sale_id,
        'invoiceNumber', v_invoice_num,
        'receiptNumber', v_receipt_num,
        'customerId', p_customer_id,
        'totalAmount', v_sale_total,
        'subtotal', v_sale_subtotal,
        'taxAmount', v_sale_tax,
        'discountAmount', COALESCE(p_discount_amount, 0.00),
        'paymentMode', p_payment_mode,
        'status', 'COMPLETED',
        'ledgerTransactionId', v_ledger_txn_id,
        'customerBalanceAfter', v_cust_balance_after,
        'isIdempotentReplay', FALSE,
        'completedAt', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- C. Customer Return Processing with Stock Condition Handling & Ledger Adjustment
CREATE OR REPLACE FUNCTION public.process_feed_return(
    p_organization_id UUID,
    p_sale_id UUID,
    p_sale_item_id UUID,
    p_return_quantity NUMERIC(12,3),
    p_stock_condition VARCHAR(20),
    p_reason TEXT,
    p_approved_by UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_existing_return RECORD;
    v_sale RECORD;
    v_item RECORD;
    v_product RECORD;
    v_approver RECORD;
    v_already_returned NUMERIC(12,3) := 0.000;
    v_base_return_qty NUMERIC(12,3);
    v_credit_amount NUMERIC(10,2);
    v_curr_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_movement_id UUID;
    v_return_id UUID;
    v_ledger_account RECORD;
    v_cust_balance_after NUMERIC(12,2);
    v_ledger_txn_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_return FROM feed_returns WHERE idempotency_key = p_idempotency_key;
    IF v_existing_return.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'returnId', v_existing_return.id,
            'saleId', v_existing_return.sale_id,
            'creditAmount', v_existing_return.credit_amount,
            'returnQuantity', v_existing_return.return_quantity,
            'stockCondition', v_existing_return.stock_condition,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Approver Role
    SELECT * INTO v_approver FROM users WHERE id = p_approved_by;
    IF v_approver.id IS NULL OR v_approver.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Return approver % is not active', p_approved_by USING ERRCODE = '22000';
    END IF;
    IF v_approver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'INVENTORY_MANAGER') THEN
        RAISE EXCEPTION 'User % with role % is not authorized to approve feed returns', p_approved_by, v_approver.role USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Sale & Item
    SELECT * INTO v_sale FROM feed_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'Sale % does not exist', p_sale_id USING ERRCODE = 'P0002';
    END IF;
    IF v_sale.status NOT IN ('COMPLETED', 'PARTIALLY_RETURNED') THEN
        RAISE EXCEPTION 'Sale % has status % and cannot accept returns', p_sale_id, v_sale.status USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_item FROM feed_sale_items WHERE id = p_sale_item_id AND sale_id = p_sale_id;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Sale item % does not exist for sale %', p_sale_item_id, p_sale_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_product FROM feed_products WHERE id = v_item.product_id;

    -- Calculate already returned quantity for this item
    SELECT COALESCE(SUM(return_quantity), 0.000) INTO v_already_returned
    FROM feed_returns
    WHERE sale_item_id = p_sale_item_id;

    IF (v_already_returned + p_return_quantity) > v_item.quantity THEN
        RAISE EXCEPTION 'Return quantity % exceeds remaining purchased quantity % (Original: %, Already returned: %)', 
            p_return_quantity, (v_item.quantity - v_already_returned), v_item.quantity, v_already_returned USING ERRCODE = '22000';
    END IF;

    -- Calculate base quantity
    IF v_item.unit = v_product.base_unit THEN
        v_base_return_qty := p_return_quantity;
    ELSE
        v_base_return_qty := p_return_quantity * v_product.pack_size;
    END IF;

    -- Calculate proportionate credit value
    v_credit_amount := ROUND((v_item.total_amount / v_item.quantity) * p_return_quantity, 2);

    -- 4. Stock Handling based on Condition
    v_return_id := gen_random_uuid();

    IF p_stock_condition = 'SALEABLE' THEN
        -- Add back to active sellable stock
        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = v_sale.center_id AND product_id = v_item.product_id 
        FOR UPDATE;

        v_new_stock := v_curr_stock + v_base_return_qty;

        UPDATE center_product_inventory
        SET current_stock = v_new_stock,
            last_movement_at = NOW(),
            updated_at = NOW()
        WHERE center_id = v_sale.center_id AND product_id = v_item.product_id;

        v_movement_id := gen_random_uuid();
        INSERT INTO stock_movements (
            id,
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp
        ) VALUES (
            v_movement_id,
            p_organization_id,
            v_sale.center_id,
            v_item.product_id,
            'CUSTOMER_RETURN',
            'IN',
            v_base_return_qty,
            v_base_return_qty,
            v_product.base_unit,
            v_new_stock,
            v_product.weighted_avg_cost,
            'FEED_RETURN',
            v_return_id,
            p_approved_by,
            p_approved_by,
            p_idempotency_key || '_stock',
            NOW()
        );
    ELSE
        -- DAMAGED condition: Do NOT add to sellable stock. Record write-off movement for audit trail.
        SELECT current_stock INTO v_curr_stock 
        FROM center_product_inventory 
        WHERE center_id = v_sale.center_id AND product_id = v_item.product_id;

        v_movement_id := gen_random_uuid();
        INSERT INTO stock_movements (
            id,
            organization_id,
            center_id,
            product_id,
            movement_type,
            direction,
            quantity,
            quantity_delta,
            base_unit,
            balance_after,
            unit_cost,
            reference_transaction_type,
            reference_id,
            actor_id,
            approved_by,
            idempotency_key,
            movement_timestamp,
            notes
        ) VALUES (
            v_movement_id,
            p_organization_id,
            v_sale.center_id,
            v_item.product_id,
            'DAMAGED_WRITE_OFF',
            'OUT',
            v_base_return_qty,
            0.000,
            v_product.base_unit,
            v_curr_stock,
            v_product.weighted_avg_cost,
            'FEED_RETURN',
            v_return_id,
            p_approved_by,
            p_approved_by,
            p_idempotency_key || '_damaged',
            NOW(),
            'Customer returned damaged feed: ' || p_reason
        );
    END IF;

    -- 5. Customer Ledger Adjustment (Credit refund if original sale was CREDIT)
    IF v_sale.payment_mode = 'CREDIT' AND v_credit_amount > 0.00 THEN
        SELECT * INTO v_ledger_account 
        FROM customer_ledger_accounts 
        WHERE customer_id = v_sale.customer_id 
        FOR UPDATE;

        -- CREDIT increases farmer payable balance (cancels out part of prior debit)
        v_cust_balance_after := v_ledger_account.current_balance + v_credit_amount;

        UPDATE customer_ledger_accounts
        SET current_balance = v_cust_balance_after,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE customer_id = v_sale.customer_id;

        v_ledger_txn_id := gen_random_uuid();
        INSERT INTO ledger_transactions (
            id,
            organization_id,
            center_id,
            customer_id,
            transaction_type,
            direction,
            amount,
            balance_after,
            reference_entity,
            reference_id,
            description,
            idempotency_key,
            created_by,
            created_at
        ) VALUES (
            v_ledger_txn_id,
            p_organization_id,
            v_sale.center_id,
            v_sale.customer_id,
            'LEDGER_ADJUSTMENT_CREDIT',
            'CREDIT',
            v_credit_amount,
            v_cust_balance_after,
            'FEED_SALE',
            v_return_id,
            'Feed return credit for invoice ' || v_sale.invoice_number,
            p_idempotency_key || '_ledger',
            p_approved_by,
            NOW()
        );

        -- Double-entry balanced entries:
        -- DEBIT: Feed Inventory (or Return Loss)
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_sale.center_id,
            'FEED_INVENTORY',
            'DEBIT',
            v_credit_amount
        );

        -- CREDIT: Customer Payable
        INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            account_type,
            entry_type,
            amount
        ) VALUES (
            v_ledger_txn_id,
            v_sale.customer_id,
            'CUSTOMER_PAYABLE',
            'CREDIT',
            v_credit_amount
        );
    END IF;

    -- 6. Insert Return Record
    INSERT INTO feed_returns (
        id,
        organization_id,
        center_id,
        sale_id,
        sale_item_id,
        customer_id,
        product_id,
        return_quantity,
        base_quantity,
        unit,
        credit_amount,
        stock_condition,
        reason,
        approved_by,
        stock_movement_id,
        ledger_transaction_id,
        idempotency_key,
        returned_at
    ) VALUES (
        v_return_id,
        p_organization_id,
        v_sale.center_id,
        p_sale_id,
        p_sale_item_id,
        v_sale.customer_id,
        v_item.product_id,
        p_return_quantity,
        v_base_return_qty,
        v_item.unit,
        v_credit_amount,
        p_stock_condition,
        p_reason,
        p_approved_by,
        v_movement_id,
        v_ledger_txn_id,
        p_idempotency_key,
        NOW()
    );

    -- 7. Update Sale Status
    IF (v_already_returned + p_return_quantity) >= v_item.quantity THEN
        UPDATE feed_sales SET status = 'RETURNED', updated_at = NOW() WHERE id = p_sale_id;
    ELSE
        UPDATE feed_sales SET status = 'PARTIALLY_RETURNED', updated_at = NOW() WHERE id = p_sale_id;
    END IF;

    -- 8. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        v_sale.center_id,
        'FEED_RETURN',
        v_return_id,
        'INSERT',
        jsonb_build_object(
            'id', v_return_id,
            'saleId', p_sale_id,
            'creditAmount', v_credit_amount,
            'stockCondition', p_stock_condition
        )
    );

    SELECT jsonb_build_object(
        'returnId', v_return_id,
        'saleId', p_sale_id,
        'creditAmount', v_credit_amount,
        'returnQuantity', p_return_quantity,
        'stockCondition', p_stock_condition,
        'customerBalanceAfter', v_cust_balance_after,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- D. Atomic Center-to-Center Inventory Transfer
CREATE OR REPLACE FUNCTION public.process_inventory_transfer(
    p_organization_id UUID,
    p_source_center_id UUID,
    p_destination_center_id UUID,
    p_product_id UUID,
    p_quantity NUMERIC(12,3),
    p_unit VARCHAR(20),
    p_initiated_by UUID,
    p_approved_by UUID,
    p_idempotency_key VARCHAR(128),
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_existing_transfer RECORD;
    v_product RECORD;
    v_source_center RECORD;
    v_dest_center RECORD;
    v_base_qty NUMERIC(12,3);
    v_src_curr_stock NUMERIC(12,3);
    v_src_balance_after NUMERIC(12,3);
    v_dst_curr_stock NUMERIC(12,3);
    v_dst_balance_after NUMERIC(12,3);
    v_transfer_id UUID;
    v_src_movement_id UUID;
    v_dst_movement_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_transfer FROM inventory_transfers WHERE idempotency_key = p_idempotency_key;
    IF v_existing_transfer.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'transferId', v_existing_transfer.id,
            'sourceCenterId', v_existing_transfer.source_center_id,
            'destinationCenterId', v_existing_transfer.destination_center_id,
            'quantity', v_existing_transfer.quantity,
            'status', v_existing_transfer.status,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Validate Centers
    IF p_source_center_id = p_destination_center_id THEN
        RAISE EXCEPTION 'Source and destination centers cannot be identical' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_center FROM dairy_centers WHERE id = p_source_center_id AND organization_id = p_organization_id;
    IF v_source_center.id IS NULL OR v_source_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Source center is not active or does not exist' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_dest_center FROM dairy_centers WHERE id = p_destination_center_id AND organization_id = p_organization_id;
    IF v_dest_center.id IS NULL OR v_dest_center.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Destination center is not active or does not exist' USING ERRCODE = '22000';
    END IF;

    -- 3. Validate Product & Unit Conversion
    SELECT * INTO v_product FROM feed_products WHERE id = p_product_id AND organization_id = p_organization_id;
    IF v_product.id IS NULL OR v_product.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Product is not active or does not exist' USING ERRCODE = '22000';
    END IF;

    IF p_unit = v_product.base_unit THEN
        v_base_qty := p_quantity;
    ELSIF p_unit = v_product.pack_unit THEN
        v_base_qty := p_quantity * v_product.pack_size;
    ELSE
        RAISE EXCEPTION 'Invalid unit % for product %', p_unit, v_product.name USING ERRCODE = '22023';
    END IF;

    IF v_base_qty <= 0.000 THEN
        RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22003';
    END IF;

    -- 4. Lock Source Center Stock & Check Availability
    SELECT current_stock INTO v_src_curr_stock 
    FROM center_product_inventory 
    WHERE center_id = p_source_center_id AND product_id = p_product_id 
    FOR UPDATE;

    IF v_src_curr_stock IS NULL OR v_src_curr_stock < v_base_qty THEN
        RAISE EXCEPTION 'Insufficient stock at source center % (Available: %, Requested: %)', 
            v_source_center.name, COALESCE(v_src_curr_stock, 0.000), v_base_qty USING ERRCODE = '22000';
    END IF;

    -- 5. Lock/Upsert Destination Center Stock
    INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, reserved_stock, reorder_threshold)
    VALUES (p_organization_id, p_destination_center_id, p_product_id, 0.000, 0.000, v_product.minimum_stock_level)
    ON CONFLICT (center_id, product_id) DO NOTHING;

    SELECT current_stock INTO v_dst_curr_stock 
    FROM center_product_inventory 
    WHERE center_id = p_destination_center_id AND product_id = p_product_id 
    FOR UPDATE;

    -- 6. Atomic Deduct and Add
    v_src_balance_after := v_src_curr_stock - v_base_qty;
    v_dst_balance_after := v_dst_curr_stock + v_base_qty;

    UPDATE center_product_inventory 
    SET current_stock = v_src_balance_after, last_movement_at = NOW(), updated_at = NOW() 
    WHERE center_id = p_source_center_id AND product_id = p_product_id;

    UPDATE center_product_inventory 
    SET current_stock = v_dst_balance_after, last_movement_at = NOW(), updated_at = NOW() 
    WHERE center_id = p_destination_center_id AND product_id = p_product_id;

    -- 7. Insert Movements with Linked Transfer UUID
    v_transfer_id := gen_random_uuid();
    v_src_movement_id := gen_random_uuid();
    v_dst_movement_id := gen_random_uuid();

    -- Source OUT movement
    INSERT INTO stock_movements (
        id,
        organization_id,
        center_id,
        product_id,
        movement_type,
        direction,
        quantity,
        quantity_delta,
        base_unit,
        balance_after,
        unit_cost,
        reference_transaction_type,
        reference_id,
        actor_id,
        approved_by,
        idempotency_key,
        movement_timestamp,
        notes
    ) VALUES (
        v_src_movement_id,
        p_organization_id,
        p_source_center_id,
        p_product_id,
        'CENTER_TRANSFER',
        'OUT',
        v_base_qty,
        -v_base_qty,
        v_product.base_unit,
        v_src_balance_after,
        v_product.weighted_avg_cost,
        'CENTER_TRANSFER',
        v_transfer_id,
        p_initiated_by,
        p_approved_by,
        p_idempotency_key || '_src',
        NOW(),
        'Transfer to center: ' || v_dest_center.name
    );

    -- Destination IN movement
    INSERT INTO stock_movements (
        id,
        organization_id,
        center_id,
        product_id,
        movement_type,
        direction,
        quantity,
        quantity_delta,
        base_unit,
        balance_after,
        unit_cost,
        reference_transaction_type,
        reference_id,
        actor_id,
        approved_by,
        idempotency_key,
        movement_timestamp,
        notes
    ) VALUES (
        v_dst_movement_id,
        p_organization_id,
        p_destination_center_id,
        p_product_id,
        'CENTER_TRANSFER',
        'IN',
        v_base_qty,
        v_base_qty,
        v_product.base_unit,
        v_dst_balance_after,
        v_product.weighted_avg_cost,
        'CENTER_TRANSFER',
        v_transfer_id,
        p_initiated_by,
        p_approved_by,
        p_idempotency_key || '_dst',
        NOW(),
        'Transfer from center: ' || v_source_center.name
    );

    -- 8. Insert Transfer Header
    INSERT INTO inventory_transfers (
        id,
        organization_id,
        source_center_id,
        destination_center_id,
        product_id,
        quantity,
        unit,
        base_quantity,
        status,
        source_movement_id,
        destination_movement_id,
        initiated_by,
        approved_by,
        transfer_date,
        notes,
        idempotency_key
    ) VALUES (
        v_transfer_id,
        p_organization_id,
        p_source_center_id,
        p_destination_center_id,
        p_product_id,
        p_quantity,
        p_unit,
        v_base_qty,
        'COMPLETED',
        v_src_movement_id,
        v_dst_movement_id,
        p_initiated_by,
        p_approved_by,
        NOW(),
        p_notes,
        p_idempotency_key
    );

    -- 9. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_source_center_id,
        'INVENTORY_TRANSFER',
        v_transfer_id,
        'INSERT',
        jsonb_build_object(
            'id', v_transfer_id,
            'sourceCenterId', p_source_center_id,
            'destinationCenterId', p_destination_center_id,
            'quantity', p_quantity,
            'unit', p_unit
        )
    );

    SELECT jsonb_build_object(
        'transferId', v_transfer_id,
        'sourceCenterId', p_source_center_id,
        'destinationCenterId', p_destination_center_id,
        'quantity', p_quantity,
        'unit', p_unit,
        'baseQuantity', v_base_qty,
        'sourceBalanceAfter', v_src_balance_after,
        'destinationBalanceAfter', v_dst_balance_after,
        'status', 'COMPLETED',
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- E. Stock Adjustment & Audited Write-off
CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(
    p_organization_id UUID,
    p_center_id UUID,
    p_product_id UUID,
    p_adjustment_type VARCHAR(40),
    p_quantity NUMERIC(12,3),
    p_direction VARCHAR(10),
    p_reason TEXT,
    p_approved_by UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_existing_adj RECORD;
    v_product RECORD;
    v_approver RECORD;
    v_curr_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_delta NUMERIC(12,3);
    v_adj_id UUID;
    v_movement_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO v_existing_adj FROM inventory_adjustments WHERE idempotency_key = p_idempotency_key;
    IF v_existing_adj.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'adjustmentId', v_existing_adj.id,
            'adjustmentType', v_existing_adj.adjustment_type,
            'quantity', v_existing_adj.quantity,
            'direction', v_existing_adj.direction,
            'isIdempotentReplay', TRUE
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- 2. Verify Approver Role
    SELECT * INTO v_approver FROM users WHERE id = p_approved_by;
    IF v_approver.id IS NULL OR v_approver.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Adjustment approver % is not active', p_approved_by USING ERRCODE = '22000';
    END IF;
    IF v_approver.role NOT IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'INVENTORY_MANAGER') THEN
        RAISE EXCEPTION 'User % with role % is not authorized to approve inventory adjustments', p_approved_by, v_approver.role USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Product
    SELECT * INTO v_product FROM feed_products WHERE id = p_product_id AND organization_id = p_organization_id;
    IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id USING ERRCODE = 'P0002';
    END IF;

    IF p_quantity <= 0.000 THEN
        RAISE EXCEPTION 'Adjustment quantity must be positive' USING ERRCODE = '22003';
    END IF;

    -- 4. Lock Center Stock
    INSERT INTO center_product_inventory (organization_id, center_id, product_id, current_stock, reserved_stock, reorder_threshold)
    VALUES (p_organization_id, p_center_id, p_product_id, 0.000, 0.000, v_product.minimum_stock_level)
    ON CONFLICT (center_id, product_id) DO NOTHING;

    SELECT current_stock INTO v_curr_stock 
    FROM center_product_inventory 
    WHERE center_id = p_center_id AND product_id = p_product_id 
    FOR UPDATE;

    IF p_direction = 'OUT' THEN
        IF v_curr_stock < p_quantity THEN
            RAISE EXCEPTION 'Cannot adjust stock below zero (Available: %, Adjustment: %)', v_curr_stock, p_quantity USING ERRCODE = '22000';
        END IF;
        v_new_stock := v_curr_stock - p_quantity;
        v_delta := -p_quantity;
    ELSIF p_direction = 'IN' THEN
        v_new_stock := v_curr_stock + p_quantity;
        v_delta := p_quantity;
    ELSE
        RAISE EXCEPTION 'Invalid direction %', p_direction USING ERRCODE = '22023';
    END IF;

    -- 5. Update Stock
    UPDATE center_product_inventory
    SET current_stock = v_new_stock,
        last_movement_at = NOW(),
        updated_at = NOW()
    WHERE center_id = p_center_id AND product_id = p_product_id;

    -- 6. Insert Movement
    v_adj_id := gen_random_uuid();
    v_movement_id := gen_random_uuid();

    INSERT INTO stock_movements (
        id,
        organization_id,
        center_id,
        product_id,
        movement_type,
        direction,
        quantity,
        quantity_delta,
        base_unit,
        balance_after,
        unit_cost,
        reference_transaction_type,
        reference_id,
        actor_id,
        approved_by,
        idempotency_key,
        movement_timestamp,
        notes
    ) VALUES (
        v_movement_id,
        p_organization_id,
        p_center_id,
        p_product_id,
        CASE WHEN p_adjustment_type = 'DAMAGED_WRITE_OFF' THEN 'DAMAGED_WRITE_OFF' ELSE 'STOCK_CORRECTION' END,
        p_direction,
        p_quantity,
        v_delta,
        v_product.base_unit,
        v_new_stock,
        v_product.weighted_avg_cost,
        'INVENTORY_ADJUSTMENT',
        v_adj_id,
        p_approved_by,
        p_approved_by,
        p_idempotency_key || '_stock',
        NOW(),
        p_reason
    );

    -- 7. Insert Adjustment Header
    INSERT INTO inventory_adjustments (
        id,
        organization_id,
        center_id,
        product_id,
        adjustment_type,
        quantity,
        direction,
        reason,
        approved_by,
        stock_movement_id,
        idempotency_key,
        adjusted_at
    ) VALUES (
        v_adj_id,
        p_organization_id,
        p_center_id,
        p_product_id,
        p_adjustment_type,
        p_quantity,
        p_direction,
        p_reason,
        p_approved_by,
        v_movement_id,
        p_idempotency_key,
        NOW()
    );

    -- 8. Sync Event
    INSERT INTO sync_events (
        organization_id,
        center_id,
        entity_type,
        entity_id,
        action,
        payload
    ) VALUES (
        p_organization_id,
        p_center_id,
        'INVENTORY_ADJUSTMENT',
        v_adj_id,
        'INSERT',
        jsonb_build_object(
            'id', v_adj_id,
            'adjustmentType', p_adjustment_type,
            'quantity', p_quantity,
            'direction', p_direction
        )
    );

    SELECT jsonb_build_object(
        'adjustmentId', v_adj_id,
        'adjustmentType', p_adjustment_type,
        'quantity', p_quantity,
        'direction', p_direction,
        'balanceAfter', v_new_stock,
        'isIdempotentReplay', FALSE
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- ==============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE feed_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- Organization Isolation Policies (Service Role / Backend Bypass or Tenant Scope)
CREATE POLICY feed_categories_org_isolation ON feed_categories
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_products_org_isolation ON feed_products
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_suppliers_org_isolation ON feed_suppliers
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY center_product_inv_org_isolation ON center_product_inventory
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_purchases_org_isolation ON feed_purchases
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_purchase_items_org_isolation ON feed_purchase_items
    FOR ALL USING (purchase_id IN (SELECT id FROM feed_purchases WHERE organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN'));

CREATE POLICY stock_movements_org_isolation ON stock_movements
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY feed_sales_org_isolation ON feed_sales
    FOR ALL USING (
        (organization_id = current_org_id() AND (
            current_user_role() IN ('DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'COLLECTION_OPERATOR')
            OR (current_user_role() = 'FARMER_CUSTOMER' AND customer_id = current_customer_id())
        ))
        OR current_user_role() = 'SUPER_ADMIN'
    );

CREATE POLICY feed_sale_items_org_isolation ON feed_sale_items
    FOR ALL USING (sale_id IN (SELECT id FROM feed_sales WHERE organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN'));

CREATE POLICY feed_returns_org_isolation ON feed_returns
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY inventory_transfers_org_isolation ON inventory_transfers
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

CREATE POLICY inventory_adjustments_org_isolation ON inventory_adjustments
    FOR ALL USING (organization_id = current_org_id() OR current_user_role() = 'SUPER_ADMIN');

