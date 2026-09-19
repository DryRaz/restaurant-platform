import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getPaymentConfig, isPaymentConfigComplete, initiateStkPush } from "@/lib/mpesa";

type IncomingLine = {
  menuItemId: string;
  name: string;
  variantLabel: string | null;
  unitPrice: number;
  quantity: number;
  modifiers: { id: string; name: string; price: number }[];
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { restaurantSlug, customerName, customerPhone, lines } = body as {
    restaurantSlug: string;
    customerName: string;
    customerPhone: string;
    lines: IncomingLine[];
  };

  if (!restaurantSlug || !customerPhone || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "Missing order details." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, status")
    .eq("slug", restaurantSlug)
    .maybeSingle();

  if (!restaurant || restaurant.status === "suspended") {
    return NextResponse.json({ error: "This restaurant is not accepting orders right now." }, { status: 404 });
  }

  const total = lines.reduce((sum, line) => {
    const modifiersTotal = line.modifiers.reduce((s, m) => s + m.price, 0);
    return sum + (line.unitPrice + modifiersTotal) * line.quantity;
  }, 0);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      restaurant_id: restaurant.id,
      customer_name: customerName || null,
      customer_phone: customerPhone,
      status: "awaiting_payment",
      total,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
  }

  for (const line of lines) {
    const { data: orderItem } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        restaurant_id: restaurant.id,
        menu_item_id: line.menuItemId,
        item_name: line.name,
        variant_label: line.variantLabel,
        unit_price: line.unitPrice,
        quantity: line.quantity,
      })
      .select("id")
      .single();

    if (orderItem && line.modifiers.length > 0) {
      await supabase.from("order_item_modifiers").insert(
        line.modifiers.map((m) => ({
          order_item_id: orderItem.id,
          restaurant_id: restaurant.id,
          name: m.name,
          price: m.price,
        }))
      );
    }
  }

  const config = await getPaymentConfig(restaurant.id);
  if (!isPaymentConfigComplete(config)) {
    await supabase
      .from("orders")
      .update({ status: "failed", payment_failure_reason: "Payments are not set up for this restaurant yet." })
      .eq("id", order.id);
    return NextResponse.json({ orderId: order.id });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  const stk = await initiateStkPush({
    restaurantId: restaurant.id,
    config,
    phone: customerPhone,
    amount: total,
    accountReference: order.id.slice(0, 8),
    callbackUrl: `${baseUrl}/api/mpesa/callback`,
  });

  if (!stk.ok) {
    await supabase
      .from("orders")
      .update({ status: "failed", payment_failure_reason: stk.reason })
      .eq("id", order.id);
    return NextResponse.json({ orderId: order.id });
  }

  await supabase
    .from("orders")
    .update({
      mpesa_checkout_request_id: stk.checkoutRequestId,
      mpesa_merchant_request_id: stk.merchantRequestId,
    })
    .eq("id", order.id);

  return NextResponse.json({ orderId: order.id });
}
