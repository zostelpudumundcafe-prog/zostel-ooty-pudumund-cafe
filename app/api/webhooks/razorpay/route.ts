import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * API Route: Receives events from Razorpay (webhooks) to ensure DB state matches actual payments,
 * especially if a user closes their browser page.
 * Route: POST /api/webhooks/razorpay
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json(
        { error: "Webhook signature header is missing." },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Server Configuration Error: Webhook secret not configured." },
        { status: 500 }
      );
    }

    // 1. Validate signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn("Invalid webhook signature received from Razorpay!");
      return NextResponse.json(
        { error: "Webhook signature verification failed." },
        { status: 400 }
      );
    }

    // 2. Parse event payload
    const eventData = JSON.parse(rawBody);
    const eventType = eventData.event;
    const payload = eventData.payload;

    console.log(`Razorpay Webhook: Received event '${eventType}'`);

    // Handle success events (payment.captured or order.paid)
    if (
      eventType === 'payment.captured' ||
      eventType === 'payment.authorized' ||
      eventType === 'order.paid'
    ) {
      const paymentEntity = payload.payment?.entity;
      const orderEntity = payload.order?.entity;
      
      const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;

      if (razorpayOrderId) {
        // Mark order as paid in the database
        const { error: dbError } = await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'captured',
            order_status: 'paid',
            razorpay_payment_id: razorpayPaymentId,
          })
          .eq('razorpay_order_id', razorpayOrderId)
          .neq('order_status', 'paid'); // Prevents double updates if already marked paid by client page

        if (dbError) {
          console.error(`Webhook error updating order for ${razorpayOrderId}:`, dbError);
          return NextResponse.json({ error: "DB Update Failed" }, { status: 500 });
        }
      }
    } 
    
    // Handle failure events
    else if (eventType === 'payment.failed') {
      const paymentEntity = payload.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;

      if (razorpayOrderId) {
        // Fetch order uuid to restore stock
        const { data: order, error: fetchError } = await supabaseAdmin
          .from('orders')
          .select('id, order_status')
          .eq('razorpay_order_id', razorpayOrderId)
          .single();

        if (order && order.order_status !== 'failed') {
          console.log(`Webhook: Payment failed. Reverting stock for order ${order.id}...`);
          await supabaseAdmin.rpc('restore_order_inventory', { p_order_id: order.id });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Razorpay Webhook Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
