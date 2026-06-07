import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * API Route: Verifies the Razorpay payment signature client-side and updates the database order status.
 * Route: POST /api/razorpay/verify
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = await req.json();

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        { error: "Missing verification parameters." },
        { status: 400 }
      );
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Server Configuration Error: Razorpay secret is missing." },
        { status: 500 }
      );
    }

    // 1. Re-generate the Razorpay signature locally
    const signText = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signText)
      .digest('hex');

    // 2. Validate the signature matches
    const isAuthentic = expectedSignature === razorpaySignature;

    if (!isAuthentic) {
      // Signature is invalid! Revert inventory stock
      console.warn(`Signature mismatch! Order: ${orderId}. Restoring stock...`);
      await supabaseAdmin.rpc('restore_order_inventory', { p_order_id: orderId });
      
      return NextResponse.json(
        { error: "Invalid payment signature verification failed." },
        { status: 400 }
      );
    }

    // 3. Update the order table to reflect a successful payment
    const { error: dbError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'captured',
        order_status: 'paid',
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
      })
      .eq('id', orderId);

    if (dbError) {
      console.error("Database update error on checkout confirmation:", dbError);
      return NextResponse.json(
        { error: "Payment verified, but database update failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, orderId });
  } catch (error: any) {
    console.error("Payment Verification Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}
