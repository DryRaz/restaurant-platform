import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getPaymentConfig, isPaymentConfigComplete, initiateStkPush } from "@/lib/mpesa";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();

  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, customer_phone, total, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "failed" && order.status !== "expired") {
    return NextResponse.json({ error: "This order isn't eligible for retry." }, { status: 400 });
  }

  const config = await getPaymentConfig(order.restaurant_id);
  if (!isPaymentConfigComplete(config)) {
    return NextResponse.json({ error: "Payments are not set up for this restaurant yet." }, { status: 400 });
  }

  await supabase.from("orders").update({ status: "awaiting_payment", payment_failure_reason: null }).eq("id", order.id);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  const stk = await initiateStkPush({
    restaurantId: order.restaurant_id,
    config,
    phone: order.customer_phone,
    amount: order.total,
    accountReference: order.id.slice(0, 8),
    callbackUrl: `${baseUrl}/api/mpesa/callback`,
  });

  if (!stk.ok) {
    await supabase.from("orders").update({ status: "failed", payment_failure_reason: stk.reason }).eq("id", order.id);
    return NextResponse.json({ error: stk.reason }, { status: 502 });
  }

  await supabase
    .from("orders")
    .update({ mpesa_checkout_request_id: stk.checkoutRequestId, mpesa_merchant_request_id: stk.merchantRequestId })
    .eq("id", order.id);

  return NextResponse.json({ ok: true });
}
