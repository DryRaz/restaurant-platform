import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Read-only status lookup for the customer confirmation page. The
 * anon key has no RLS access to `orders` (staff-only), so this route
 * uses the service role key server-side and returns only what a
 * customer holding this order's (unguessable) id needs to see.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, total, payment_failure_reason, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, item_name, variant_label, unit_price, quantity")
    .eq("order_id", order.id);

  const { data: modifiers } = await supabase
    .from("order_item_modifiers")
    .select("order_item_id, name, price")
    .in("order_item_id", (items || []).map((i) => i.id));

  const itemsWithModifiers = (items || []).map((item) => ({
    ...item,
    modifiers: (modifiers || []).filter((m) => m.order_item_id === item.id),
  }));

  return NextResponse.json({ ...order, items: itemsWithModifiers });
}
