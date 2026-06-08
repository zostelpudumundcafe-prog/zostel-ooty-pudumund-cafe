-- Zostel Ooty Pudumund Cafe Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. MENU ITEMS
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    category TEXT NOT NULL,
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. INVENTORY
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL UNIQUE,
    quantity_stock NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (quantity_stock >= 0),
    unit_type TEXT NOT NULL CHECK (unit_type IN ('grams', 'quantity', 'ml')),
    alert_threshold NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (alert_threshold >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. MENU ITEM INVENTORY REQUIREMENTS (Ingredients)
CREATE TABLE menu_item_inventory_requirements (
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
    quantity_required NUMERIC(10, 2) NOT NULL CHECK (quantity_required > 0),
    PRIMARY KEY (menu_item_id, inventory_item_id)
);

-- 4. ORDERS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_mobile TEXT NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'authorized', 'captured', 'failed')),
    order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'paid', 'preparing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. ORDER ITEMS
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_sale NUMERIC(10, 2) NOT NULL CHECK (price_at_sale >= 0)
);

-- RLS (Row Level Security) CONFIGURATION
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_inventory_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- POLICIES

-- Menu Items
CREATE POLICY "Allow public read access to menu items" ON menu_items
    FOR SELECT USING (is_available = true);

CREATE POLICY "Allow admin full access to menu items" ON menu_items
    FOR ALL USING (auth.role() = 'service_role' OR (auth.jwt()->>'email') IS NOT NULL);

-- Inventory
CREATE POLICY "Allow admin full access to inventory" ON inventory
    FOR ALL USING (auth.role() = 'service_role' OR (auth.jwt()->>'email') IS NOT NULL);

-- Menu Item Requirements
CREATE POLICY "Allow admin full access to inventory requirements" ON menu_item_inventory_requirements
    FOR ALL USING (auth.role() = 'service_role' OR (auth.jwt()->>'email') IS NOT NULL);

-- Orders
CREATE POLICY "Allow customers to insert orders" ON orders
    FOR INSERT WITH CHECK (true); -- Customers can place orders

CREATE POLICY "Allow customers to view their own order details" ON orders
    FOR SELECT USING (true); -- In a full system, you could filter by mobile/session, but for QR codes public select is fine or checked on server

CREATE POLICY "Allow admin full access to orders" ON orders
    FOR ALL USING (auth.role() = 'service_role' OR (auth.jwt()->>'email') IS NOT NULL);

-- Order Items
CREATE POLICY "Allow customers to insert order items" ON order_items
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow customers to view order items" ON order_items
    FOR SELECT USING (true);

CREATE POLICY "Allow admin full access to order items" ON order_items
    FOR ALL USING (auth.role() = 'service_role' OR (auth.jwt()->>'email') IS NOT NULL);


-- DATABASE FUNCTIONS (ATOMIC OPERATIONS)

-- 1. Create order & decrement inventory in one transaction
CREATE OR REPLACE FUNCTION place_order_and_decrement_inventory(
    p_customer_name TEXT,
    p_customer_mobile TEXT,
    p_total_amount NUMERIC,
    p_razorpay_order_id TEXT,
    p_items JSONB -- Expected array of objects: [{"menu_item_id": "uuid", "quantity": integer, "price": numeric}]
) RETURNS UUID SECURITY DEFINER AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_menu_item_id UUID;
    v_qty INT;
    v_price NUMERIC;
    v_req RECORD;
BEGIN
    -- A. Insert Order
    INSERT INTO orders (customer_name, customer_mobile, total_amount, razorpay_order_id, payment_status, order_status)
    VALUES (p_customer_name, p_customer_mobile, p_total_amount, p_razorpay_order_id, 'pending', 'pending')
    RETURNING id INTO v_order_id;

    -- B. Loop and process each order item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_price := (v_item->>'price')::NUMERIC;

        -- Insert Order Item
        INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_sale)
        VALUES (v_order_id, v_menu_item_id, v_qty, v_price);

        -- Lock and update inventory ingredients for this menu item
        FOR v_req IN 
            SELECT r.inventory_item_id, r.quantity_required, i.item_name, i.quantity_stock, i.alert_threshold
            FROM menu_item_inventory_requirements r
            JOIN inventory i ON i.id = r.inventory_item_id
            WHERE r.menu_item_id = v_menu_item_id
            FOR UPDATE -- Row-level lock to prevent concurrent race conditions
        LOOP
            -- Check for sufficient stock including alert threshold buffer
            IF (v_req.quantity_stock - (v_req.quantity_required * v_qty)) < v_req.alert_threshold THEN
                RAISE EXCEPTION 'Insufficient stock for %: safety threshold is %, remaining stock would be %', 
                    v_req.item_name, v_req.alert_threshold, (v_req.quantity_stock - (v_req.quantity_required * v_qty));
            END IF;

            -- Decrement stock
            UPDATE inventory
            SET quantity_stock = quantity_stock - (v_req.quantity_required * v_qty)
            WHERE id = v_req.inventory_item_id;
        END LOOP;
    END LOOP;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Restore inventory if payment fails or order cancelled
CREATE OR REPLACE FUNCTION restore_order_inventory(
    p_order_id UUID
) RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    v_item RECORD;
    v_req RECORD;
BEGIN
    -- Only restore if order exists and is not already marked as 'failed' to prevent duplicate restorations
    IF EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND order_status != 'failed') THEN
        
        -- Update order status to failed
        UPDATE orders 
        SET order_status = 'failed', payment_status = 'failed' 
        WHERE id = p_order_id;

        -- Loop and restore ingredients
        FOR v_item IN SELECT menu_item_id, quantity FROM order_items WHERE order_id = p_order_id
        LOOP
            FOR v_req IN
                SELECT inventory_item_id, quantity_required
                FROM menu_item_inventory_requirements
                WHERE menu_item_id = v_item.menu_item_id
            LOOP
                UPDATE inventory
                SET quantity_stock = quantity_stock + (v_req.quantity_required * v_item.quantity)
                WHERE id = v_req.inventory_item_id;
            END LOOP;
        END LOOP;

    END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. STORAGE BUCKET CONFIGURATION FOR MENU IMAGES
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage objects (menu-images)
CREATE POLICY "Allow public read access to menu images" ON storage.objects
    FOR SELECT USING (bucket_id = 'menu-images');

CREATE POLICY "Allow admin full access to menu images" ON storage.objects
    FOR ALL USING (
        bucket_id = 'menu-images' AND 
        (auth.role() = 'service_role' OR (auth.jwt()->>'email') IS NOT NULL)
    );

-- 7. SECURE MULTI-INGREDIENT STOCK AVAILABILITY CHECKER
CREATE OR REPLACE FUNCTION get_menu_items_with_stock()
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    price NUMERIC,
    category TEXT,
    image_url TEXT,
    is_available BOOLEAN,
    created_at TIMESTAMPTZ,
    is_in_stock BOOLEAN
) SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.name,
        m.description,
        m.price,
        m.category,
        m.image_url,
        m.is_available,
        m.created_at,
        COALESCE(
            NOT EXISTS (
                SELECT 1 
                FROM menu_item_inventory_requirements r
                JOIN inventory i ON i.id = r.inventory_item_id
                WHERE r.menu_item_id = m.id AND (i.quantity_stock - r.quantity_required) < i.alert_threshold
            ),
            true
        ) AS is_in_stock
    FROM menu_items m
    WHERE m.is_available = true
    ORDER BY m.category ASC, m.name ASC;
END;
$$ LANGUAGE plpgsql;

-- 8. SECURE MULTI-ITEM CART INVENTORY VALIDATOR
CREATE OR REPLACE FUNCTION validate_cart_stock(
    p_items JSONB -- Expected array of objects: [{"menu_item_id": "uuid", "quantity": integer}]
) RETURNS TABLE (
    is_valid BOOLEAN,
    error_message TEXT
) SECURITY DEFINER AS $$
DECLARE
    v_req RECORD;
BEGIN
    FOR v_req IN 
        WITH cart_items AS (
            SELECT 
                (elem->>'menu_item_id')::UUID AS menu_item_id,
                (elem->>'quantity')::INT AS quantity
            FROM jsonb_array_elements(p_items) AS elem
        ),
        required_stock AS (
            SELECT 
                r.inventory_item_id,
                i.item_name,
                i.quantity_stock,
                i.alert_threshold,
                i.unit_type,
                SUM(r.quantity_required * c.quantity) AS total_required
            FROM cart_items c
            JOIN menu_item_inventory_requirements r ON r.menu_item_id = c.menu_item_id
            JOIN inventory i ON i.id = r.inventory_item_id
            GROUP BY r.inventory_item_id, i.item_name, i.quantity_stock, i.alert_threshold, i.unit_type
        )
        SELECT item_name, quantity_stock, alert_threshold, total_required, unit_type
        FROM required_stock
        WHERE (quantity_stock - total_required) < alert_threshold
    LOOP
        is_valid := false;
        error_message := 'Insufficient stock for ' || v_req.item_name || ': requires ' || v_req.total_required || ' ' || v_req.unit_type || ', but only ' || (v_req.quantity_stock - v_req.alert_threshold) || ' ' || v_req.unit_type || ' is available.';
        RETURN NEXT;
    END LOOP;

    -- If no loops occurred, it's valid
    IF NOT FOUND THEN
        is_valid := true;
        error_message := NULL;
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;


