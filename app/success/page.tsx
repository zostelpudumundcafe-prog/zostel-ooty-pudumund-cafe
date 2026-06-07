import { supabaseAdmin } from '@/lib/supabase/admin';
import SuccessClient from '@/components/SuccessClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface SuccessPageProps {
  searchParams: {
    order_id?: string;
  };
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const orderId = searchParams.order_id;

  if (!orderId) {
    redirect('/');
  }

  // 1. Fetch Order Header details using admin client (bypasses potential RLS constraints for users viewing receipt)
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    console.error("Error fetching success order details:", orderError);
    redirect('/');
  }

  // 2. Fetch Order Items details including menu item names
  const { data: orderItemsData, error: itemsError } = await supabaseAdmin
    .from('order_items')
    .select(`
      id,
      quantity,
      price_at_sale,
      menu_items (
        name
      )
    `)
    .eq('order_id', orderId);

  if (itemsError) {
    console.error("Error fetching order items details:", itemsError);
  }

  // Format order items for display and print payload
  const formattedItems = (orderItemsData || []).map((item: any) => ({
    name: item.menu_items?.name || 'Cafe Item',
    quantity: item.quantity,
    price: item.price_at_sale,
  }));

  return (
    <main className="flex-1 flex flex-col h-full bg-zostel-gray-light">
      <SuccessClient order={order} items={formattedItems} />
    </main>
  );
}
