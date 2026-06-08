'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MenuItem } from '@/lib/supabase/types';
import { Search, ShoppingBag, Plus, Minus, Coffee, Utensils, Moon } from 'lucide-react';

interface MenuClientProps {
  initialMenuItems: MenuItem[];
}

export default function MenuClient({ initialMenuItems }: MenuClientProps) {
  const [menuItems] = useState<MenuItem[]>(initialMenuItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<{ [id: string]: { item: MenuItem; quantity: number } }>({});
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true when component mounts to avoid hydration mismatch
  useEffect(() => {
    setIsClient(true);
    const savedCart = localStorage.getItem('zostel_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart from local storage', e);
      }
    }
  }, []);

  // Update localStorage whenever cart changes
  const saveCart = (newCart: typeof cart) => {
    setCart(newCart);
    localStorage.setItem('zostel_cart', JSON.stringify(newCart));
  };

  const addToCart = (item: MenuItem) => {
    const newCart = { ...cart };
    if (newCart[item.id]) {
      newCart[item.id].quantity += 1;
    } else {
      newCart[item.id] = { item, quantity: 1 };
    }
    saveCart(newCart);
  };

  const removeFromCart = (itemId: string) => {
    const newCart = { ...cart };
    if (!newCart[itemId]) return;
    if (newCart[itemId].quantity > 1) {
      newCart[itemId].quantity -= 1;
    } else {
      delete newCart[itemId];
    }
    saveCart(newCart);
  };

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(menuItems.map((item) => item.category)))];

  // Filter items based on search query and category
  const filteredItems = menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cartItemsArray = Object.values(cart);
  const cartTotalItems = cartItemsArray.reduce((acc, curr) => acc + curr.quantity, 0);
  const cartTotalPrice = cartItemsArray.reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);

  // Format currency
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="flex flex-col flex-1 pb-24 min-h-full">
      {/* Brand Header */}
      <div className="bg-zostel-charcoal text-white p-6 rounded-b-3xl shadow-md relative overflow-hidden">
        {/* Background Decorative Circles */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-zostel-orange rounded-full filter blur-2xl opacity-20 -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-zostel-orange rounded-full filter blur-2xl opacity-10 -ml-10 -mb-10" />

        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-xs uppercase tracking-widest text-zostel-orange font-semibold">Zostel Cafe</span>
            <h1 className="text-2xl font-bold tracking-tight">Ooty Pudumund</h1>
          </div>
          <div className="h-10 w-10 bg-zostel-orange rounded-full flex items-center justify-center text-white font-bold shadow-md shadow-zostel-orange/30">
            Z
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search delicious bites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zostel-charcoal-light border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-zostel-orange focus:ring-1 focus:ring-zostel-orange transition-all-custom"
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Category Horizontal Scroll */}
      <div className="px-4 py-4 overflow-x-auto scrollbar-none flex gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all-custom ${
              selectedCategory === category
                ? 'bg-zostel-orange text-white shadow-sm shadow-zostel-orange/20'
                : 'bg-white border border-zostel-gray-dark/40 text-zostel-charcoal hover:bg-zostel-gray-light'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Food Items List */}
      <div className="flex-1 px-4 space-y-4">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Utensils className="h-12 w-12 text-zostel-charcoal/30 mb-3" />
            <h3 className="font-semibold text-zostel-charcoal-light">No items found</h3>
            <p className="text-xs text-gray-500 mt-1">Try resetting filters or searching for something else.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const cartQuantity = cart[item.id]?.quantity || 0;
            const inStock = item.is_in_stock;
            
            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl p-4 flex gap-4 shadow-sm border border-zostel-gray-dark/20 transition-all duration-350 hover:shadow-md ${
                  !inStock ? 'opacity-65 grayscale-[30%]' : ''
                }`}
              >
                {/* Item Image or Placeholder */}
                <div className="w-20 h-20 bg-zostel-orange-subtle rounded-xl flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Coffee className="h-8 w-8 text-zostel-orange" />
                  )}
                  
                  {/* Sold Out Overlay */}
                  {!inStock && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-[9px] uppercase font-black text-white px-1.5 py-0.5 border border-white/50 rounded bg-zostel-charcoal/80">
                        Sold Out
                      </span>
                    </div>
                  )}
                </div>

                {/* Item Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-zostel-charcoal leading-snug">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold text-zostel-orange">
                      {formatPrice(item.price)}
                    </span>

                    {/* Quantity selectors / Add button */}
                    {!inStock ? (
                      <button
                        disabled
                        className="bg-zostel-gray text-gray-400 font-bold text-xs px-4 py-2 rounded-full cursor-not-allowed border border-zostel-gray-dark/50"
                      >
                        Sold Out
                      </button>
                    ) : isClient && cartQuantity > 0 ? (
                      <div className="flex items-center bg-zostel-gray rounded-full p-1 border border-zostel-gray-dark/50 shadow-inner">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="h-6 w-6 rounded-full bg-white flex items-center justify-center shadow-sm text-zostel-charcoal active:scale-95"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold">{cartQuantity}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="h-6 w-6 rounded-full bg-zostel-orange flex items-center justify-center shadow-sm text-white active:scale-95"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="bg-zostel-charcoal text-white hover:bg-zostel-charcoal-light font-bold text-xs px-4 py-2 rounded-full flex items-center gap-1 shadow-sm active:scale-95 transition-all-custom"
                      >
                        <Plus className="h-3.5 w-3.5 text-zostel-orange" />
                        Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Cart Drawer */}
      {isClient && cartTotalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 pb-6 pt-4 bg-gradient-to-t from-white via-white to-white/90 backdrop-blur-sm border-t border-zostel-gray-dark/30 z-30">
          <div className="bg-zostel-charcoal rounded-2xl p-4 flex justify-between items-center text-white shadow-xl shadow-zostel-charcoal/20">
            <div className="flex items-center gap-3">
              <div className="bg-zostel-orange p-2.5 rounded-xl relative">
                <ShoppingBag className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-white text-zostel-charcoal text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-zostel-charcoal">
                  {cartTotalItems}
                </span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Total Price</p>
                <p className="font-bold text-zostel-orange text-lg leading-tight">{formatPrice(cartTotalPrice)}</p>
              </div>
            </div>

            <Link
              href="/cart"
              className="bg-zostel-orange hover:bg-zostel-orange-dark text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition-all-custom flex items-center gap-1.5 active:scale-95"
            >
              View Cart
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
