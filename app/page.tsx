import { supabase } from '@/lib/supabase/client';
import MenuClient from '@/components/MenuClient';
import { MenuItem } from '@/lib/supabase/types';

// Force dynamic rendering to always fetch fresh menu item availabilities
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MenuPage() {
  if (!supabase) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white min-h-screen">
        <div className="h-16 w-16 bg-zostel-orange-subtle rounded-full flex items-center justify-center text-zostel-orange mb-4">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-zostel-charcoal">Database Connection Required</h2>
        <p className="text-xs text-gray-500 mt-2 max-w-xs leading-relaxed">
          Please copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase credentials to launch the cafe menu.
        </p>
      </main>
    );
  }

  // Fetch available menu items with dynamic stock calculations using the database RPC function
  const { data, error } = await supabase.rpc('get_menu_items_with_stock');

  if (error) {
    console.error("Error fetching menu items:", error);
  }

  const menuItems: MenuItem[] = data || [];

  return (
    <main className="flex-1 flex flex-col h-full bg-zostel-gray-light">
      <MenuClient initialMenuItems={menuItems} />
    </main>
  );
}
