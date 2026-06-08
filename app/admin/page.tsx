'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { MenuItem, InventoryItem, Order } from '@/lib/supabase/types';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  BookOpen, 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  AlertTriangle, 
  Check, 
  LogOut, 
  Lock, 
  Loader2,
  QrCode,
  Printer
} from 'lucide-react';

export default function AdminDashboard() {
  // Check if supabase is configured
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

  // Dashboard navigation state
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'inventory' | 'qrcodes'>('orders');

  // Database resource states
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // Forms states
  const [tableNumber, setTableNumber] = useState('1');
  const [showItemModal, setShowItemModal] = useState(false);
  const [menuRequirements, setMenuRequirements] = useState<Array<{
    inventory_item_id: string;
    quantity_required: number;
    item_name?: string;
    unit_type?: string;
  }>>([]);
  const [selectedIngId, setSelectedIngId] = useState('');
  const [ingQtyRequired, setIngQtyRequired] = useState(0);
  const [menuForm, setMenuForm] = useState({
    id: '',
    name: '',
    description: '',
    price: 0,
    category: 'Beverages',
    image_url: '',
    is_available: true,
  });

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryForm, setInventoryForm] = useState({
    id: '',
    item_name: '',
    quantity_stock: 0,
    unit_type: 'quantity' as any,
    alert_threshold: 0,
  });

  // Track session on mount
  useEffect(() => {
    supabase.auth.getSession().then((res: any) => {
      const session = res.data?.session;
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data if authenticated
  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'orders') {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        setOrders(data || []);
      } else if (activeTab === 'menu') {
        const { data: menuData } = await supabase
          .from('menu_items')
          .select('*')
          .order('category')
          .order('name');
        setMenuItems(menuData || []);

        const { data: invData } = await supabase
          .from('inventory')
          .select('id, item_name, unit_type')
          .order('item_name');
        setInventory(invData || []);
      } else if (activeTab === 'inventory') {
        const { data } = await supabase
          .from('inventory')
          .select('*')
          .order('item_name');
        setInventory(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

  // Order Operations
  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ order_status: status })
      .eq('id', orderId);
    if (error) alert(error.message);
    else fetchData();
  };

  // Menu Operations
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setImageUploading(true);
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `menu/${fileName}`;

      // Upload file to Supabase storage bucket 'menu-images'
      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('menu-images')
        .getPublicUrl(filePath);

      setMenuForm(prev => ({ ...prev, image_url: publicUrl }));
    } catch (err: any) {
      console.error("Image upload failed:", err);
      alert("Image upload failed: " + err.message);
    } finally {
      setImageUploading(false);
    }
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: menuForm.name,
      description: menuForm.description || null,
      price: menuForm.price,
      category: menuForm.category,
      image_url: menuForm.image_url || null,
      is_available: menuForm.is_available,
    };

    let error;
    let menuItemId = '';

    if (menuForm.id) {
      const { error: err } = await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', menuForm.id);
      menuItemId = menuForm.id;
      error = err;
    } else {
      const { data: newItem, error: err } = await supabase
        .from('menu_items')
        .insert(payload)
        .select('id')
        .single();
      if (newItem) {
        menuItemId = newItem.id;
      }
      error = err;
    }

    if (error) {
      alert(error.message);
    } else {
      // Sync ingredients in the requirements table
      if (menuItemId) {
        // A. Delete existing ingredients for this menu item
        await supabase
          .from('menu_item_inventory_requirements')
          .delete()
          .eq('menu_item_id', menuItemId);

        // B. Insert new ingredient mappings
        if (menuRequirements.length > 0) {
          const insertPayload = menuRequirements.map(req => ({
            menu_item_id: menuItemId,
            inventory_item_id: req.inventory_item_id,
            quantity_required: req.quantity_required,
          }));

          const { error: reqError } = await supabase
            .from('menu_item_inventory_requirements')
            .insert(insertPayload);

          if (reqError) {
            console.error("Failed to insert menu requirements:", reqError);
          }
        }
      }

      setShowItemModal(false);
      fetchData();
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  // Inventory Operations
  const handleSaveInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      item_name: inventoryForm.item_name,
      quantity_stock: inventoryForm.quantity_stock,
      unit_type: inventoryForm.unit_type,
      alert_threshold: inventoryForm.alert_threshold,
    };

    let error;
    if (inventoryForm.id) {
      const { error: err } = await supabase
        .from('inventory')
        .update(payload)
        .eq('id', inventoryForm.id);
      error = err;
    } else {
      const { error: err } = await supabase
        .from('inventory')
        .insert(payload);
      error = err;
    }

    if (error) alert(error.message);
    else {
      setShowInventoryModal(false);
      fetchData();
    }
  };

  const handleDeleteInventoryItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ingredient?")) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  // Loader state while checking auth session on startup
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zostel-gray-light">
        <Loader2 className="h-8 w-8 animate-spin text-zostel-orange" />
      </div>
    );
  }

  // LOGIN SCREEN
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zostel-charcoal p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-zostel-orange rounded-full filter blur-2xl opacity-10 -mr-6 -mt-6" />
          
          <div className="text-center mb-6">
            <div className="h-12 w-12 bg-zostel-orange rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto shadow-md shadow-zostel-orange/30">
              Z
            </div>
            <h2 className="text-xl font-extrabold text-zostel-charcoal mt-3">Zostel Admin Portal</h2>
            <p className="text-xs text-gray-500 mt-1">Sign in to manage cafe orders, menu & stock</p>
          </div>

          {loginError && (
            <div className="mb-4 bg-red-50 text-red-600 p-2.5 rounded-xl text-xs font-semibold">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="admin@zostel.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2.5 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange focus:ring-1 focus:ring-zostel-orange"
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
                className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2.5 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange focus:ring-1 focus:ring-zostel-orange"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-sm py-3 rounded-xl shadow-md transition-all-custom flex items-center justify-center gap-1.5 active:scale-95 mt-6"
            >
              <Lock className="h-4 w-4" /> Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ADMIN DASHBOARD SCREEN
  return (
    <div className="min-h-screen bg-zostel-gray-light flex flex-col max-w-none border-0">
      {/* Top Navbar */}
      <header className="bg-zostel-charcoal text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-zostel-orange rounded-full flex items-center justify-center text-white font-bold">
            Z
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight">Ooty Pudumund</h1>
            <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Cafe Admin Portal</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg border border-white/10 hover:bg-white/5 transition-all-custom"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign Out
        </button>
      </header>

      {/* Tabs list */}
      <div className="bg-white border-b border-zostel-gray-dark/40 px-6 flex gap-4">
        {[
          { id: 'orders', label: 'Orders Queue', icon: ShoppingBag },
          { id: 'menu', label: 'Menu Editor', icon: BookOpen },
          { id: 'inventory', label: 'Inventory & Stock', icon: Package },
          { id: 'qrcodes', label: 'Website QR', icon: QrCode }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-4 px-2 border-b-2 text-xs font-bold transition-all-custom ${
                activeTab === tab.id
                  ? 'border-zostel-orange text-zostel-orange'
                  : 'border-transparent text-gray-500 hover:text-zostel-charcoal'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zostel-orange" />
          </div>
        ) : (
          <>
            {/* ORDERS TAB */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-zostel-charcoal">Incoming Orders</h2>
                  <button onClick={fetchData} className="text-xs text-zostel-orange font-bold hover:underline">Refresh</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {orders.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500 bg-white border rounded-xl">No orders available.</div>
                  ) : (
                    orders.map(order => (
                      <div key={order.id} className="bg-white rounded-xl border border-zostel-gray-dark/20 p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-mono font-bold text-gray-400">ID: {order.id.slice(0, 8).toUpperCase()}</p>
                              <h3 className="font-extrabold text-sm text-zostel-charcoal mt-1">{order.customer_name}</h3>
                              <p className="text-[10px] text-gray-500">+91 {order.customer_mobile}</p>
                            </div>
                            <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-full ${
                              order.order_status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                              order.order_status === 'preparing' ? 'bg-amber-50 text-amber-600' :
                              order.order_status === 'completed' ? 'bg-blue-50 text-blue-600' :
                              'bg-red-50 text-red-600'
                            }`}>
                              {order.order_status}
                            </span>
                          </div>

                          <div className="mt-4 border-t border-dashed border-zostel-gray-dark/30 pt-3 flex justify-between">
                            <span className="text-xs font-bold text-gray-400">Total Bill</span>
                            <span className="text-xs font-bold text-zostel-orange">₹{order.total_amount}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex gap-2 border-t border-zostel-gray-dark/20 pt-3">
                          {order.order_status === 'paid' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'preparing')}
                              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] py-2 rounded-lg transition-all-custom"
                            >
                              Start Cooking
                            </button>
                          )}
                          {order.order_status === 'preparing' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'completed')}
                              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] py-2 rounded-lg transition-all-custom"
                            >
                              Mark Completed
                            </button>
                          )}
                          {order.order_status !== 'completed' && order.order_status !== 'failed' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'failed')}
                              className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] px-3 py-2 rounded-lg transition-all-custom"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* MENU EDITOR TAB */}
            {activeTab === 'menu' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-zostel-charcoal">Menu Items</h2>
                  <button
                    onClick={() => {
                      setMenuForm({ id: '', name: '', description: '', price: 0, category: 'Beverages', image_url: '', is_available: true });
                      setMenuRequirements([]);
                      setSelectedIngId('');
                      setIngQtyRequired(0);
                      setShowItemModal(true);
                    }}
                    className="bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all-custom"
                  >
                    <Plus className="h-4 w-4" /> Add Menu Item
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-zostel-gray-dark/20 overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zostel-gray border-b border-zostel-gray-dark/40 font-bold text-gray-500">
                        <th className="p-3">Name</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Price</th>
                        <th className="p-3">Availability</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuItems.map(item => (
                        <tr key={item.id} className="border-b border-zostel-gray-dark/20 hover:bg-zostel-gray-light">
                          <td className="p-3 font-semibold">{item.name}</td>
                          <td className="p-3">{item.category}</td>
                          <td className="p-3 font-bold text-zostel-orange">₹{item.price}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold ${
                              item.is_available ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                            }`}>
                              {item.is_available ? 'Available' : 'Sold Out'}
                            </span>
                          </td>
                          <td className="p-3 text-right flex justify-end gap-2">
                            <button
                              onClick={async () => {
                                setMenuForm({
                                  id: item.id,
                                  name: item.name,
                                  description: item.description || '',
                                  price: item.price,
                                  category: item.category,
                                  image_url: item.image_url || '',
                                  is_available: item.is_available,
                                });
                                setMenuRequirements([]);
                                setSelectedIngId('');
                                setIngQtyRequired(0);
                                setShowItemModal(true);

                                // Fetch current ingredients mapping for this menu item
                                const { data: reqs } = await supabase
                                  .from('menu_item_inventory_requirements')
                                  .select(`
                                    inventory_item_id,
                                    quantity_required,
                                    inventory (
                                      item_name,
                                      unit_type
                                    )
                                  `)
                                  .eq('menu_item_id', item.id);
                                
                                if (reqs) {
                                  setMenuRequirements(reqs.map((r: any) => ({
                                    inventory_item_id: r.inventory_item_id,
                                    quantity_required: r.quantity_required,
                                    item_name: r.inventory?.item_name || 'Ingredient',
                                    unit_type: r.inventory?.unit_type || 'grams',
                                  })));
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-zostel-orange"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteMenuItem(item.id)}
                              className="p-1 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* INVENTORY EDITOR TAB */}
            {activeTab === 'inventory' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-zostel-charcoal">Raw Materials & Ingredients</h2>
                  <button
                    onClick={() => {
                      setInventoryForm({ id: '', item_name: '', quantity_stock: 0, unit_type: 'quantity', alert_threshold: 0 });
                      setShowInventoryModal(true);
                    }}
                    className="bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all-custom"
                  >
                    <Plus className="h-4 w-4" /> Add Stock Item
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-zostel-gray-dark/20 overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zostel-gray border-b border-zostel-gray-dark/40 font-bold text-gray-500">
                        <th className="p-3">Ingredient Name</th>
                        <th className="p-3">Current Stock</th>
                        <th className="p-3">Unit Type</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map(item => {
                        const isLow = item.quantity_stock <= item.alert_threshold;
                        return (
                          <tr key={item.id} className="border-b border-zostel-gray-dark/20 hover:bg-zostel-gray-light">
                            <td className="p-3 font-semibold">{item.item_name}</td>
                            <td className={`p-3 font-mono font-bold ${isLow ? 'text-red-600' : 'text-zostel-charcoal'}`}>
                              {item.quantity_stock}
                            </td>
                            <td className="p-3 text-gray-500">{item.unit_type}</td>
                            <td className="p-3">
                              {isLow ? (
                                <span className="flex items-center gap-1 text-red-600 font-bold">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Reorder
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                  <Check className="h-3.5 w-3.5" /> OK
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setInventoryForm({
                                    id: item.id,
                                    item_name: item.item_name,
                                    quantity_stock: item.quantity_stock,
                                    unit_type: item.unit_type,
                                    alert_threshold: item.alert_threshold,
                                  });
                                  setShowInventoryModal(true);
                                }}
                                className="p-1 text-gray-400 hover:text-zostel-orange"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteInventoryItem(item.id)}
                                className="p-1 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* WEBSITE QR CODE TAB */}
            {activeTab === 'qrcodes' && (
              <div className="space-y-4 max-w-sm mx-auto">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-zostel-charcoal">Website QR Code</h2>
                </div>

                <div className="bg-white rounded-xl border border-zostel-gray-dark/20 p-6 shadow-sm space-y-6">
                  {/* QR Card */}
                  <div id="qr-card" className="border border-zostel-gray-dark/40 rounded-2xl p-6 bg-white flex flex-col items-center text-center shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-2 bg-zostel-orange" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-zostel-orange mt-2">Zostel Cafe</span>
                    <h3 className="font-extrabold text-sm text-zostel-charcoal leading-snug">Ooty Pudumund</h3>
                    
                    {/* QR Image */}
                    <div className="my-6 p-3 bg-zostel-gray rounded-xl border border-zostel-gray-dark/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                          typeof window !== 'undefined' ? window.location.origin : 'https://zostel-ooty-cafe.vercel.app'
                        )}`}
                        alt="Zostel Cafe QR Menu"
                        className="w-40 h-40 object-contain"
                      />
                    </div>
                    
                    <div className="bg-zostel-charcoal text-white rounded-full px-6 py-2.5 text-xs font-black shadow-md shadow-zostel-charcoal/20">
                      SCAN MENU
                    </div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-3">Scan to browse, order & pay</p>
                  </div>

                  {/* Action Buttons */}
                  <button
                    onClick={() => {
                      const imgElement = document.getElementById('qr-card')?.querySelector('img');
                      if (imgElement) {
                        const win = window.open('', '_blank');
                        if (win) {
                          win.document.write(`
                            <html>
                              <head>
                                <title>Print Zostel Cafe QR</title>
                                <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                                <style>
                                  @media print {
                                    body { padding: 20px; }
                                  }
                                </style>
                              </head>
                              <body class="flex items-center justify-center min-h-screen bg-white">
                                <div class="w-80 border-2 border-gray-300 rounded-3xl p-8 flex flex-col items-center text-center shadow-md relative overflow-hidden">
                                  <div class="absolute top-0 left-0 right-0 h-3 bg-red-500" style="background-color: #FF5A36;"></div>
                                  <span class="text-xs uppercase font-extrabold tracking-widest text-red-500 mt-2" style="color: #FF5A36;">Zostel Cafe</span>
                                  <h3 class="font-extrabold text-lg text-gray-800 leading-snug">Ooty Pudumund</h3>
                                  <div class="my-6 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                    ${imgElement.outerHTML}
                                  </div>
                                  <div class="bg-gray-800 text-white rounded-full px-8 py-3 text-sm font-black shadow-md">
                                    SCAN MENU
                                  </div>
                                  <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-4">Scan to browse, order & pay</p>
                                </div>
                                <script>
                                  window.onload = function() {
                                    window.print();
                                    setTimeout(function() { window.close(); }, 500);
                                  }
                                </script>
                              </body>
                            </html>
                          `);
                          win.document.close();
                        }
                      }
                    }}
                    className="w-full bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-xs py-3.5 rounded-xl shadow-md transition-all-custom flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Printer className="h-4 w-4" /> Print QR Card
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* MENU MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 bg-zostel-charcoal/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <h3 className="font-bold text-sm text-zostel-charcoal mb-4">
              {menuForm.id ? "Edit Menu Item" : "Create Menu Item"}
            </h3>
            <form onSubmit={handleSaveMenuItem} className="space-y-3">
              <div>
                <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Hot Coffee"
                  value={menuForm.name}
                  onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                  className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Description</label>
                <textarea
                  placeholder="Details about raw taste..."
                  value={menuForm.description}
                  onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })}
                  className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Price (INR)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={menuForm.price}
                    onChange={(e) => setMenuForm({ ...menuForm, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Category</label>
                  <select
                    value={menuForm.category}
                    onChange={(e) => setMenuForm({ ...menuForm, category: e.target.value })}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                  >
                    <option value="Beverages">Beverages</option>
                    <option value="Breakfast">Breakfast</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Mains">Mains</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Menu Item Image</label>
                <div className="space-y-2">
                  {/* File Upload Input */}
                  <div className="relative border border-dashed border-zostel-gray-dark/50 rounded-xl p-3 bg-zostel-gray flex flex-col items-center justify-center hover:bg-zostel-gray-light transition-all-custom cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={imageUploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {imageUploading ? (
                      <div className="flex items-center gap-1.5 text-xs text-zostel-orange font-bold">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading Image...
                      </div>
                    ) : (
                      <div className="text-center text-xs text-gray-500 font-medium">
                        <span className="text-zostel-orange font-bold">Click to upload</span> or drag and drop image
                      </div>
                    )}
                  </div>
                  
                  {/* Manual URL Input (Fallback) */}
                  <input
                    type="text"
                    placeholder="Or enter manual Image URL (https://...)"
                    value={menuForm.image_url}
                    onChange={(e) => setMenuForm({ ...menuForm, image_url: e.target.value })}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-[10px] text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                  />
                </div>
              </div>

              {/* INGREDIENTS REQUIREMENTS SECTION */}
              <div className="border-t border-zostel-gray-dark/30 pt-3 space-y-2">
                <label className="block text-[10px] uppercase font-bold text-gray-400">Ingredients Required (Stock Deduction)</label>
                
                {/* List of current requirements */}
                {menuRequirements.length > 0 ? (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {menuRequirements.map((req, index) => (
                      <div key={index} className="flex justify-between items-center bg-zostel-gray p-2 rounded-lg text-xs">
                        <span className="font-semibold text-zostel-charcoal">
                          {req.item_name} — {req.quantity_required} {req.unit_type}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuRequirements(prev => prev.filter((_, i) => i !== index));
                          }}
                          className="text-red-500 hover:text-red-700 font-bold px-1"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-500 italic">No ingredients mapped yet. (Will not check inventory levels on order)</p>
                )}

                {/* Inline form to add ingredient */}
                <div className="grid grid-cols-12 gap-2 items-end bg-zostel-gray-light p-2.5 rounded-xl border border-zostel-gray-dark/30">
                  <div className="col-span-6">
                    <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Select Ingredient</label>
                    <select
                      value={selectedIngId}
                      onChange={(e) => setSelectedIngId(e.target.value)}
                      className="w-full bg-white border border-zostel-gray-dark/40 rounded-lg p-1 text-[10px] text-zostel-charcoal focus:outline-none"
                    >
                      <option value="">-- Choose --</option>
                      {inventory.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.item_name} ({item.unit_type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ingQtyRequired || ''}
                      onChange={(e) => setIngQtyRequired(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-zostel-gray-dark/40 rounded-lg p-1 text-[10px] text-zostel-charcoal focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedIngId) return;
                        const ing = inventory.find(i => i.id === selectedIngId);
                        if (!ing) return;
                        
                        // Check if already added
                        if (menuRequirements.some(r => r.inventory_item_id === selectedIngId)) {
                          alert("Ingredient already added. Remove it first to change quantity.");
                          return;
                        }

                        if (ingQtyRequired <= 0) {
                          alert("Please enter a valid quantity greater than 0.");
                          return;
                        }

                        setMenuRequirements(prev => [...prev, {
                          inventory_item_id: selectedIngId,
                          quantity_required: ingQtyRequired,
                          item_name: ing.item_name,
                          unit_type: ing.unit_type,
                        }]);
                        
                        // Reset form fields
                        setSelectedIngId('');
                        setIngQtyRequired(0);
                      }}
                      className="w-full bg-zostel-charcoal text-white hover:bg-zostel-charcoal-light font-bold text-[10px] py-1.5 rounded-lg text-center"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="is_available"
                  checked={menuForm.is_available}
                  onChange={(e) => setMenuForm({ ...menuForm, is_available: e.target.checked })}
                  className="rounded border-gray-300 text-zostel-orange focus:ring-zostel-orange"
                />
                <label htmlFor="is_available" className="text-xs font-semibold text-zostel-charcoal">Available for purchase</label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zostel-gray-dark/20">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-semibold hover:bg-zostel-gray"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zostel-orange hover:bg-zostel-orange-dark text-white rounded-xl text-xs font-semibold"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVENTORY MODAL */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-zostel-charcoal/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm relative">
            <h3 className="font-bold text-sm text-zostel-charcoal mb-4">
              {inventoryForm.id ? "Edit Ingredient" : "Create Ingredient"}
            </h3>
            <form onSubmit={handleSaveInventoryItem} className="space-y-3">
              <div>
                <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Ingredient Name</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Milk"
                  value={inventoryForm.item_name}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, item_name: e.target.value })}
                  className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Quantity Stock</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={inventoryForm.quantity_stock}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, quantity_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Unit Type</label>
                  <select
                    value={inventoryForm.unit_type}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, unit_type: e.target.value as any })}
                    className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                  >
                    <option value="quantity">Quantity (Pcs)</option>
                    <option value="grams">Grams</option>
                    <option value="kg">Kilograms</option>
                    <option value="ml">Milliliters</option>
                    <option value="liters">Liters</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1">Low-Stock Alert Threshold</label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={inventoryForm.alert_threshold}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, alert_threshold: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-zostel-gray border border-zostel-gray-dark/50 rounded-xl px-3 py-2 text-xs text-zostel-charcoal focus:outline-none focus:border-zostel-orange"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zostel-gray-dark/20">
                <button
                  type="button"
                  onClick={() => setShowInventoryModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-semibold hover:bg-zostel-gray"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zostel-orange hover:bg-zostel-orange-dark text-white rounded-xl text-xs font-semibold"
                >
                  Save Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
