'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { ArrowLeft, Trash2, Plus, Minus, CreditCard, Loader2 } from 'lucide-react';
import { MenuItem } from '@/lib/supabase/types';
import { createCheckoutOrder, handlePaymentFailure } from '@/lib/actions/checkout';

interface CartItem {
  item: MenuItem;
  quantity: number;
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<{ [id: string]: CartItem }>({});
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const savedCart = localStorage.getItem('zostel_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart', e);
      }
    }
  }, []);

  const saveCart = (newCart: typeof cart) => {
    setCart(newCart);
    localStorage.setItem('zostel_cart', JSON.stringify(newCart));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    const newCart = { ...cart };
    if (!newCart[itemId]) return;
    const newQty = newCart[itemId].quantity + delta;
    if (newQty <= 0) {
      delete newCart[itemId];
    } else {
      newCart[itemId].quantity = newQty;
    }
    saveCart(newCart);
  };

  const removeItem = (itemId: string) => {
    const newCart = { ...cart };
    delete newCart[itemId];
    saveCart(newCart);
  };

  const cartItems = Object.values(cart);
  const totalAmount = cartItems.reduce((sum, current) => sum + (current.item.price * current.quantity), 0);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return;
    if (!customerName.trim() || !customerMobile.trim()) {
      alert("Please fill in your Name and Mobile Number.");
      return;
    }

    if (customerMobile.length !== 10 || !/^\d+$/.test(customerMobile)) {
      alert("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);

    // Prepare items for checkout
    const checkoutItems = cartItems.map(c => ({
      menu_item_id: c.item.id,
      quantity: c.quantity,
      price: c.item.price
    }));

    try {
      // 1. Create order on server and lock inventory
      const res = await createCheckoutOrder({
        customerName,
        customerMobile,
        items: checkoutItems
      });

      if (!res.success || !res.orderId) {
        throw new Error(res.error || "Failed to create checkout order.");
      }

      if (res.isMock) {
        // Direct mock payment checkout redirection
        localStorage.removeItem('zostel_cart');
        router.push(`/success?order_id=${res.orderId}`);
        return;
      }

      const { orderId, razorpayOrderId, amount, currency, keyId } = res;

      // 2. Configure Razorpay Standard Checkout SDK Options
      const options = {
        key: keyId,
        amount: amount,
        currency: currency,
        name: "Zostel Ooty Pudumund",
        description: "Cafe Order Checkout",
        order_id: razorpayOrderId,
        prefill: {
          name: customerName,
          contact: customerMobile,
        },
        theme: {
          color: "#FF5A36", // Zostel Orange
        },
        handler: async function (response: any) {
          // Triggered on payment success
          setLoading(true);
          try {
            // Send to verification route
            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            const verifyResult = await verifyRes.json();

            if (verifyResult.success) {
              // Clear cart from local storage on success
              localStorage.removeItem('zostel_cart');
              router.push(`/success?order_id=${orderId}`);
            } else {
              alert(verifyResult.error || "Payment verification failed.");
              setLoading(false);
            }
          } catch (err) {
            console.error("Verification callback failed:", err);
            alert("Verification connection issue. Webhook will process if payment went through.");
            setLoading(false);
          }
        },
        modal: {
          ondismiss: async function () {
            // Triggered if the user closes the payment window
            console.log("Razorpay checkout modal dismissed by user. Releasing reserved stock...");
            await handlePaymentFailure(orderId);
            setLoading(false);
          }
        }
      };

      // 3. Open Razorpay Checkout overlay
      const rzp = new (window as any).Razorpay(options);
      rzp.open();

    } catch (err: any) {
      console.error("Payment initiation failed:", err);
      alert(err.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  if (!isClient) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zostel-orange" />
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        <div className="bg-white px-4 py-5 border-b border-zostel-gray-dark/20 flex items-center gap-3 sticky top-0 z-10">
          <Link href="/" className="p-1 rounded-full hover:bg-zostel-gray text-zostel-charcoal">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Your Cart</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Zostel Ooty Pudumund</p>
          </div>
        </div>

        {/* Cart Content */}
        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
            <div className="h-16 w-16 bg-zostel-orange-subtle rounded-full flex items-center justify-center text-zostel-orange mb-4">
              <Trash2 className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-bold text-zostel-charcoal">Your cart is empty</h2>
            <p className="text-xs text-gray-500 mt-1">Browse the menu and add items to satisfy your cravings.</p>
            <Link
              href="/"
              className="mt-6 bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition-all-custom"
            >
              Back to Menu
            </Link>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between">
            {/* Scrollable list */}
            <div className="px-4 py-4 space-y-4 overflow-y-auto">
              {cartItems.map((cartItem) => {
                const itemTotal = cartItem.item.price * cartItem.quantity;
                return (
                  <div
                    key={cartItem.item.id}
                    className="flex gap-4 p-3 bg-white rounded-xl border border-zostel-gray-dark/20 items-center justify-between"
                  >
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-zostel-charcoal leading-snug">{cartItem.item.name}</h4>
                      <p className="text-xs text-zostel-orange font-bold mt-1">{formatPrice(cartItem.item.price)}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-zostel-gray rounded-full p-0.5 border border-zostel-gray-dark/50">
                        <button
                          onClick={() => updateQuantity(cartItem.item.id, -1)}
                          className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow-sm text-zostel-charcoal active:scale-95"
                          disabled={loading}
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{cartItem.quantity}</span>
                        <button
                          onClick={() => updateQuantity(cartItem.item.id, 1)}
                          className="h-5 w-5 rounded-full bg-zostel-orange flex items-center justify-center shadow-sm text-white active:scale-95"
                          disabled={loading}
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(cartItem.item.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-zostel-gray-dark/30 pt-4 mt-6">
                <div className="flex justify-between items-center text-sm font-semibold text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatPrice(totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-semibold text-gray-500 mt-2">
                  <span>CGST & SGST (5%)</span>
                  <span>Included</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold text-zostel-charcoal mt-3 pt-3 border-t border-dashed border-zostel-gray-dark/50">
                  <span>Grand Total</span>
                  <span className="text-zostel-orange">{formatPrice(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Checkout Form */}
            <form onSubmit={handleCheckout} className="p-4 bg-white border-t border-zostel-gray-dark/20 space-y-4">
              <h3 className="font-bold text-sm text-zostel-charcoal">Checkout Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={loading}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2.5 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange focus:ring-1 focus:ring-zostel-orange"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit number"
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, ''))}
                    disabled={loading}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2.5 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange focus:ring-1 focus:ring-zostel-orange"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-sm py-4 rounded-xl shadow-md transition-all-custom flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    Pay & Confirm Order ({formatPrice(totalAmount)})
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
