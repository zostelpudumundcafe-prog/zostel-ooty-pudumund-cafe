'use server';

import Razorpay from 'razorpay';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Initialize Razorpay SDK on the server
const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

interface CheckoutItem {
  menu_item_id: string;
  quantity: number;
  price: number;
}

interface CheckoutData {
  customerName: string;
  customerMobile: string;
  items: CheckoutItem[];
}

/**
 * Server Action: Securely creates a Razorpay order, reserves inventory, 
 * and inserts the pending order into the database.
 */
export async function createCheckoutOrder(data: CheckoutData) {
  try {
    if (!data.customerName || !data.customerMobile || data.items.length === 0) {
      throw new Error("Missing required customer details or order items.");
    }

    // 1. Calculate the total order amount
    const totalAmount = data.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (totalAmount <= 0) {
      throw new Error("Invalid total amount.");
    }

    // Razorpay accepts amounts in the smallest currency unit (paise for INR)
    const amountInPaise = Math.round(totalAmount * 100);

    // 2. Generate the Razorpay Order
    const rpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `zostel_rcpt_${Date.now()}`,
      notes: {
        customer_name: data.customerName,
        customer_mobile: data.customerMobile,
      },
    });

    // 3. Atomically insert the order & decrement inventory in Supabase via RPC
    const { data: orderId, error: txError } = await supabaseAdmin.rpc(
      'place_order_and_decrement_inventory',
      {
        p_customer_name: data.customerName,
        p_customer_mobile: data.customerMobile,
        p_total_amount: totalAmount,
        p_razorpay_order_id: rpOrder.id,
        p_items: JSON.stringify(data.items), // Send items as a JSON string to PostgreSQL
      }
    );

    if (txError) {
      console.error("Database transaction error:", txError);
      throw new Error(`Inventory allocation failed: ${txError.message}`);
    }

    return {
      success: true,
      orderId, // Internal database UUID
      razorpayOrderId: rpOrder.id, // Razorpay Order ID
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    };
  } catch (error: any) {
    console.error("Error in createCheckoutOrder:", error);
    return {
      success: false,
      error: error.message || "Failed to initiate payment. Please try again.",
    };
  }
}

/**
 * Server Action: Restores inventory if payment fails or user cancels checkout
 */
export async function handlePaymentFailure(orderId: string) {
  try {
    if (!orderId) throw new Error("Order ID is required.");

    const { error } = await supabaseAdmin.rpc('restore_order_inventory', {
      p_order_id: orderId,
    });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in handlePaymentFailure:", error);
    return { success: false, error: error.message || "Failed to restore stock." };
  }
}
