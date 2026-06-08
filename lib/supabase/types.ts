export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  is_available: boolean;
  is_in_stock: boolean;
  missing_ingredients?: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  item_name: string;
  quantity_stock: number;
  unit_type: 'grams' | 'quantity' | 'ml';
  alert_threshold: number;
  created_at: string;
}

export interface MenuItemInventoryRequirement {
  menu_item_id: string;
  inventory_item_id: string;
  quantity_required: number;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_mobile: string;
  total_amount: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  payment_status: 'pending' | 'authorized' | 'captured' | 'failed';
  order_status: 'pending' | 'paid' | 'preparing' | 'completed' | 'failed';
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  quantity: number;
  price_at_sale: number;
}
