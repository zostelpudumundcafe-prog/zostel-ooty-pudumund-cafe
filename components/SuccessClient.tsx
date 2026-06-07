'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Printer, ShoppingBag, ArrowRight } from 'lucide-react';
import { Order } from '@/lib/supabase/types';

interface FormattedOrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface SuccessClientProps {
  order: Order;
  items: FormattedOrderItem[];
}

export default function SuccessClient({ order, items }: SuccessClientProps) {
  const [printStatus, setPrintStatus] = useState<'idle' | 'sent' | 'unsupported'>('idle');

  const getReceiptPayload = () => {
    return {
      order_id: order.id,
      razorpay_order_id: order.razorpay_order_id,
      customer_name: order.customer_name,
      customer_mobile: order.customer_mobile,
      total_amount: order.total_amount,
      created_at: order.created_at,
      items: items,
    };
  };

  const triggerNativePrint = () => {
    const bridge = (window as any).androidBridge;
    if (typeof window !== 'undefined' && bridge && typeof bridge.postMessage === 'function') {
      try {
        const payload = JSON.stringify(getReceiptPayload());
        console.log("Sending receipt JSON to Android Bridge:", payload);
        bridge.postMessage(payload);
        setPrintStatus('sent');
        return true;
      } catch (error) {
        console.error("Android Bridge communication error:", error);
        return false;
      }
    } else {
      console.warn("androidBridge.postMessage is not available in this context.");
      setPrintStatus('unsupported');
      return false;
    }
  };

  // Auto-print receipt on load
  useEffect(() => {
    // Delay slightly to ensure bridge binding is complete in the WebView
    const timer = setTimeout(() => {
      triggerNativePrint();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      {/* Top Success Banner */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-8">
        <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-4 animate-bounce">
          <CheckCircle className="h-12 w-12" />
        </div>
        <span className="text-[10px] uppercase font-bold tracking-widest text-zostel-orange">Order Confirmed</span>
        <h1 className="text-2xl font-bold text-zostel-charcoal mt-1">Order Placed Successfully!</h1>
        <p className="text-xs text-gray-500 max-w-xs mt-2 leading-relaxed">
          Your payment was verified. Our kitchen team has started preparing your hot meals.
        </p>

        {/* Receipt card */}
        <div className="w-full bg-white rounded-2xl p-5 border border-zostel-gray-dark/30 shadow-sm mt-8 text-left">
          <div className="flex justify-between items-center pb-3 border-b border-dashed border-zostel-gray-dark/50">
            <div>
              <p className="text-[9px] uppercase font-bold text-gray-400">Order ID</p>
              <p className="text-xs font-mono font-bold text-zostel-charcoal">{order.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase font-bold text-gray-400">Date</p>
              <p className="text-xs font-bold text-zostel-charcoal">
                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="py-4 space-y-2">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Items Ordered</p>
            {items.map((item, index) => (
              <div key={index} className="flex justify-between text-xs font-medium text-zostel-charcoal">
                <span>
                  {item.name} <span className="text-zostel-orange font-bold font-mono">x{item.quantity}</span>
                </span>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-dashed border-zostel-gray-dark/50 flex justify-between items-center">
            <span className="text-xs font-bold text-zostel-charcoal">Total Amount Paid</span>
            <span className="text-sm font-black text-zostel-orange">{formatPrice(order.total_amount)}</span>
          </div>

          <div className="mt-3 bg-zostel-gray p-2.5 rounded-lg text-[10px] text-gray-500 font-medium">
            <p><strong>Customer:</strong> {order.customer_name}</p>
            <p className="mt-0.5"><strong>Mobile:</strong> +91 {order.customer_mobile}</p>
          </div>
        </div>

        {/* Printing status notice */}
        {printStatus === 'sent' && (
          <p className="text-[10px] text-emerald-600 font-bold mt-4 animate-pulse flex items-center gap-1">
            <Printer className="h-3 w-3" /> Receipt sent to kiosk thermal printer automatically.
          </p>
        )}
        {printStatus === 'unsupported' && (
          <p className="text-[10px] text-gray-400 font-medium mt-4">
            Viewing in standard browser. Bridge is active only inside the Android Kiosk Wrapper.
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {printStatus !== 'unsupported' && (
          <button
            onClick={triggerNativePrint}
            className="w-full bg-zostel-charcoal text-white hover:bg-zostel-charcoal-light font-bold text-sm py-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all-custom active:scale-95"
          >
            <Printer className="h-4 w-4 text-zostel-orange" />
            Print Receipt Again
          </button>
        )}

        <Link
          href="/"
          className="w-full bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-sm py-4 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all-custom active:scale-95"
        >
          <ShoppingBag className="h-4 w-4" />
          Order More Food
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
