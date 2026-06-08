'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Order, MenuItem } from '@/lib/supabase/types';
import { 
  ShoppingBag, 
  Check, 
  LogOut, 
  Lock, 
  Loader2,
  Volume2,
  Clock,
  AlertCircle
} from 'lucide-react';

interface KitchenOrder extends Order {
  order_items?: Array<{
    id: string;
    quantity: number;
    price_at_sale: number;
    menu_items?: {
      name: string;
    } | null;
  }>;
}

// Web Audio API alarm sound synthesizer helper
class WebAlarmManager {
  private audioCtx: AudioContext | null = null;
  private intervalId: any = null;

  start() {
    if (this.intervalId) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      this.audioCtx = new AudioCtxClass();

      this.intervalId = setInterval(() => {
        if (!this.audioCtx) return;
        try {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          
          const now = this.audioCtx.currentTime;
          osc.type = 'sine';
          
          // Dual beep sound pattern
          osc.frequency.setValueAtTime(880, now); // A5 note
          osc.frequency.setValueAtTime(1046.50, now + 0.15); // C6 note
          
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          
          osc.start();
          osc.stop(now + 0.4);
        } catch (e) {
          console.error("Oscillator playback failed:", e);
        }
      }, 700);
    } catch (err) {
      console.error("Failed to initialize AudioContext:", err);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
    }
  }
}

export default function KitchenConsole() {
  if (!supabase) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zostel-charcoal p-6 text-center">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl text-center">
          <div className="h-12 w-12 bg-zostel-orange-subtle rounded-full flex items-center justify-center text-zostel-orange mx-auto mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-zostel-charcoal">Configuration Required</h2>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Admin console requires Supabase credentials. Copy <code>.env.example</code> to <code>.env.local</code> and fill in your keys to get started.
          </p>
        </div>
      </div>
    );
  }

  // Authentication states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  // Queue and interaction states
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [newOrderQueue, setNewOrderQueue] = useState<KitchenOrder[]>([]);
  
  // Timer for relative order durations (e.g. "X minutes ago")
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Web Alarm Manager Ref
  const alarmManagerRef = useRef<WebAlarmManager | null>(null);
  
  // Track order IDs for which alerts have already been played/shown to prevent duplicate notifications
  const alertedOrderIds = useRef<Set<string>>(new Set());

  // Initialize session checks
  useEffect(() => {
    supabase.auth.getSession().then((res: any) => {
      setSession(res.data?.session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Initialize Web Audio alarm manager
    alarmManagerRef.current = new WebAlarmManager();

    return () => {
      subscription.unsubscribe();
      alarmManagerRef.current?.stop();
    };
  }, []);

  // Update timestamps live every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Set up realtime channel subscription and fetch initial pending orders
  useEffect(() => {
    if (session) {
      fetchPendingOrders();

      // Subscribe to changes on orders table
      const channel = supabase
        .channel('kitchen-realtime-orders')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'orders' 
        }, async (payload: any) => {
          console.log("Realtime order database change received:", payload);
          
          const order = payload.new as Order;
          
          // Trigger popup/sound if order status transitions to 'paid'
          if (order && order.order_status === 'paid') {
            if (!alertedOrderIds.current.has(order.id)) {
              alertedOrderIds.current.add(order.id);
              handleNewOrderArrival(order.id);
              return;
            }
          }
          
          // Refresh active orders list
          fetchPendingOrders();
        })
        .subscribe();

      // Bind global bridge callback for android native AlertDialog dismissals
      (window as any).onNativeDialogDismissed = () => {
        console.log("Native dialog dismissed callback received in Web View.");
        handleDismissAlert();
      };

      return () => {
        supabase.removeChannel(channel);
        delete (window as any).onNativeDialogDismissed;
      };
    }
  }, [session]);

  const fetchPendingOrders = async () => {
    setLoading(true);
    try {
      // Fetch paid or preparing orders (Kitchen Queue focuses on unfilled orders)
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, menu_items(name))')
        .in('order_status', ['paid', 'preparing'])
        .order('created_at', { ascending: true }); // Chef works oldest-to-newest

      if (error) throw error;
      const fetchedOrders = data || [];
      setOrders(fetchedOrders);
      
      // Populate already alerted order IDs on initial fetch so they don't trigger alerts
      if (fetchedOrders.length > 0 && alertedOrderIds.current.size === 0) {
        fetchedOrders.forEach((o:any) => {
          alertedOrderIds.current.add(o.id);
        });
      }
    } catch (e) {
      console.error("Error fetching pending orders:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleNewOrderArrival = async (orderId: string) => {
    try {
      // Query full details of the newly inserted order
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, menu_items(name))')
        .eq('id', orderId)
        .single();

      if (error || !data) return;

      const orderData = data as KitchenOrder;

      // Always add to the custom web popup modal queue
      setNewOrderQueue(prev => [...prev, orderData]);

      // Create a nice list summary string for items
      const itemsList = orderData.order_items?.map(
        item => `• ${item.menu_items?.name || 'Unknown Item'} x${item.quantity}`
      ).join('\n') || '';

      // Check if Android Native bridge is active — use it ONLY for playing alarm sound
      const kitchenBridge = (window as any).kitchenBridge;
      if (kitchenBridge && typeof kitchenBridge.postMessage === 'function') {
        // Tell Android to play the native alarm sound only (no native dialog)
        kitchenBridge.postMessage(JSON.stringify({
          type: "PLAY_SOUND_ONLY",
          customer_name: orderData.customer_name,
          total_amount: orderData.total_amount,
          items_summary: itemsList
        }));
      } else {
        // Fallback: Play web audio alarm synthesiser in browser
        alarmManagerRef.current?.start();
      }

      // Refresh list to include new order
      fetchPendingOrders();
    } catch (err) {
      console.error("Error processing new order notification:", err);
    }
  };

  const handleDismissAlert = () => {
    setNewOrderQueue(prev => {
      const remaining = prev.slice(1);
      if (remaining.length === 0) {
        // Stop web audio alarm (browser fallback)
        alarmManagerRef.current?.stop();
        // Tell Android to stop native alarm sound too
        const kitchenBridge = (window as any).kitchenBridge;
        if (kitchenBridge && typeof kitchenBridge.postMessage === 'function') {
          kitchenBridge.postMessage(JSON.stringify({ type: "STOP_SOUND" }));
        }
      }
      return remaining;
    });
  };

  const testWebAlarm = () => {
    // Allows user to click and interact with page (activating AudioContext) and testing sounds
    alarmManagerRef.current?.start();
    setTimeout(() => {
      alarmManagerRef.current?.stop();
    }, 1200);
  };

  const markOrderCompleted = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: 'completed' })
        .eq('id', orderId);

      if (error) {
        alert("Failed to complete order: " + error.message);
      } else {
        // Successful status change removes it from pending list
        setOrders(prev => prev.filter(order => order.id !== orderId));
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(error.message);
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const getElapsedTime = (createdAtString: string) => {
    const created = new Date(createdAtString).getTime();
    const elapsedMs = currentTime - created;
    const elapsedMins = Math.floor(elapsedMs / 60000);
    if (elapsedMins < 1) return 'Just now';
    return `${elapsedMins}m ago`;
  };

  const getElapsedTimeColor = (createdAtString: string) => {
    const created = new Date(createdAtString).getTime();
    const elapsedMins = Math.floor((currentTime - created) / 60000);
    if (elapsedMins >= 15) return 'text-red-500 font-black animate-pulse';
    if (elapsedMins >= 8) return 'text-amber-500 font-bold';
    return 'text-gray-400';
  };

  // Render Loader during initial auth validation
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zostel-gray-light">
        <Loader2 className="h-8 w-8 animate-spin text-zostel-orange" />
      </div>
    );
  }

  // LOGIN SCREEN (Standard Admin/Kitchen Credentials Required)
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zostel-charcoal p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-zostel-orange rounded-full filter blur-2xl opacity-10 -mr-6 -mt-6" />
          
          <div className="text-center mb-6">
            <div className="h-12 w-12 bg-zostel-orange rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto shadow-md">
              Z
            </div>
            <h2 className="text-xl font-extrabold text-zostel-charcoal mt-3">Kitchen Display Console</h2>
            <p className="text-xs text-gray-500 mt-1 font-medium">Log in to view incoming orders & dispatch</p>
          </div>

          {loginError && (
            <div className="mb-4 bg-red-50 text-red-600 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="kitchen@zostel.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2.5 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2.5 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-sm py-3 rounded-xl shadow-md transition-all active:scale-95 mt-6 flex items-center justify-center gap-1.5"
            >
              <Lock className="h-4 w-4" /> Start Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ACTIVE KITCHEN DASHBOARD VIEW
  return (
    <div className="min-h-screen bg-zostel-gray-light flex flex-col">
      {/* Top Navbar */}
      <header className="bg-zostel-charcoal text-white px-6 py-4 flex justify-between items-center shadow-md border-b-2 border-zostel-orange">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-zostel-orange rounded-full flex items-center justify-center text-white font-bold">
            Z
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight">Ooty Pudumund Cafe</h1>
            <p className="text-[9px] uppercase tracking-wider text-zostel-orange font-black">Kitchen Order Queue</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Test Sound Button */}
          <button
            onClick={testWebAlarm}
            title="Test web notification alert chime"
            className="text-gray-400 hover:text-white flex items-center gap-1 text-[11px] font-bold py-1.5 px-3 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
          >
            <Volume2 className="h-3.5 w-3.5" /> Test Sound
          </button>

          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" /> Log Out
          </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-extrabold text-zostel-charcoal">Pending Prep Queue</h2>
            <p className="text-xs text-gray-500 mt-0.5">Showing orders sorted oldest first. Total pending: {orders.length}</p>
          </div>
          <button 
            onClick={fetchPendingOrders} 
            className="bg-white text-zostel-orange hover:bg-zostel-orange-subtle border border-zostel-orange/30 text-xs font-bold py-1.5 px-3 rounded-xl shadow-sm transition-all"
          >
            Refresh Queue
          </button>
        </div>

        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-zostel-orange" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading order queue...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white border border-zostel-gray-dark/20 rounded-2xl p-6 shadow-sm">
            <div className="h-12 w-12 bg-zostel-orange-subtle rounded-full flex items-center justify-center text-zostel-orange mx-auto mb-3">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h3 className="font-extrabold text-sm text-zostel-charcoal">All Orders Done!</h3>
            <p className="text-xs text-gray-500 mt-1">There are no pending orders in the kitchen. Enjoy the break!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div 
                key={order.id} 
                className="bg-white rounded-2xl border border-zostel-gray-dark/40 shadow-sm flex flex-col justify-between overflow-hidden hover:shadow-md transition-all relative"
              >
                {/* Visual indicator bar depending on prep status */}
                <div className={`h-1.5 w-full ${order.order_status === 'preparing' ? 'bg-amber-400' : 'bg-zostel-orange'}`} />
                
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Card Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-gray-400 uppercase bg-zostel-gray px-2 py-0.5 rounded border border-zostel-gray-dark/20">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <h3 className="font-black text-base text-zostel-charcoal mt-2.5 leading-tight">{order.customer_name}</h3>
                        <p className="text-xs text-gray-500 font-semibold mt-0.5">+91 {order.customer_mobile}</p>
                      </div>
                      
                      {/* Timer indicators */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <Clock className={`h-3.5 w-3.5 ${getElapsedTimeColor(order.created_at)}`} />
                          <span className={`text-[11px] font-bold ${getElapsedTimeColor(order.created_at)}`}>
                            {getElapsedTime(order.created_at)}
                          </span>
                        </div>
                        <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${
                          order.order_status === 'preparing' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {order.order_status}
                        </span>
                      </div>
                    </div>

                    {/* Ordered Items list */}
                    <div className="mt-4 bg-zostel-gray-light p-3 rounded-xl border border-zostel-gray-dark/20">
                      <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Kitchen Order Slip</span>
                      <div className="mt-1.5 space-y-2">
                        {order.order_items?.map((item) => (
                          <div key={item.id} className="flex justify-between text-xs text-zostel-charcoal items-center border-b border-zostel-gray-dark/10 pb-1.5 last:border-b-0 last:pb-0">
                            <span className="font-extrabold flex items-center gap-1.5">
                              <span className="bg-zostel-charcoal text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black">
                                {item.quantity}
                              </span>
                              {item.menu_items?.name || 'Unknown Item'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="mt-5 pt-3 border-t border-dashed border-zostel-gray-dark/30">
                    <button
                      disabled={actionLoadingId === order.id}
                      onClick={() => markOrderCompleted(order.id)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
                    >
                      {actionLoadingId === order.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Marking done...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 stroke-[3px]" />
                          Mark as Done
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* WEB FALLBACK POPUP DIALOG MODAL */}
      {newOrderQueue.length > 0 && (() => {
        const activePopup = newOrderQueue[0];
        return (
          <div className="fixed inset-0 bg-zostel-charcoal/80 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative border-2 border-zostel-orange overflow-hidden transform scale-100 transition-transform">
              {/* Pulsing indicator banner */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-zostel-orange animate-pulse" />
              
              <div className="text-center mt-2">
                <span className="bg-zostel-orange-subtle text-zostel-orange text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                  New Order Received! {newOrderQueue.length > 1 && `(${1} of ${newOrderQueue.length})`}
                </span>
                <h3 className="text-xl font-black text-zostel-charcoal mt-4 leading-snug">
                  {activePopup.customer_name}
                </h3>
                <p className="text-xs text-gray-500 font-bold mt-0.5">Mobile: +91 {activePopup.customer_mobile}</p>
              </div>

              {/* Order Slip Items inside modal */}
              <div className="my-5 bg-zostel-gray-light rounded-2xl p-4 border border-zostel-gray-dark/30 max-h-48 overflow-y-auto">
                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-2 border-b border-zostel-gray-dark/20 pb-1">
                  Items to Prepare
                </span>
                <div className="space-y-2.5">
                  {activePopup.order_items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm text-zostel-charcoal font-black">
                      <span className="flex items-center gap-2">
                        <span className="bg-zostel-orange text-white text-xs px-2 py-0.5 rounded-md font-bold">
                          x{item.quantity}
                        </span>
                        {item.menu_items?.name || 'Unknown Item'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total display */}
              <div className="flex justify-between items-center bg-zostel-orange-subtle rounded-xl p-3 mb-5 border border-zostel-orange/20">
                <span className="text-xs font-bold text-gray-600">Total Amount Received</span>
                <span className="text-sm font-extrabold text-zostel-orange">₹{activePopup.total_amount}</span>
              </div>

              {/* Dismiss Button */}
              <button
                onClick={handleDismissAlert}
                className="w-full bg-zostel-charcoal hover:bg-zostel-charcoal-light text-white font-extrabold text-sm py-4 rounded-2xl shadow-lg transition-all active:scale-98"
              >
                {newOrderQueue.length > 1 ? 'Next Order' : 'OK, Accept Order'}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
