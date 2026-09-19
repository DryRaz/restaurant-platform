import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseCallbackMetadata } from "@/lib/mpesa";

/**
 * Safaricom's Daraja webhook. Always returns 200 -- Safaricom retries
 * aggressively on anything else, and there is nothing a retry would
 * fix here. Idempotent on Body.stkCallback.CheckoutRequestID doubling
 * as the dedupe key alongside a unique event id.
 */
export async function POST(req: NextRequest) {
  const payload = await req.json();
  const supabase = supabaseServer();

  const callback = payload?.Body?.stkCallback;
  if (!callback) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const checkoutRequestId = callback.CheckoutRequestID as string;
  const eventId = `${checkoutRequestId}:${callback.ResultCode}`;

  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, status")
    .eq("mpesa_checkout_request_id", checkoutRequestId)
    .maybeSingle();

  // Log every callback for audit, regardless of whether we can match it
  // to an order -- ignore a duplicate-key conflict on event_id, that's
  // Safaricom retrying the same result.
  await supabase
    .from("payment_webhook_logs")
    .insert({ restaurant_id: order?.restaurant_id ?? null, event_id: eventId, raw_payload: payload })
    .then(() => {}, () => {});

  if (!order || order.status !== "awaiting_payment") {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (callback.ResultCode === 0) {
    const meta = parseCallbackMetadata(callback.CallbackMetadata?.Item || []);
    await supabase
      .from("orders")
      .update({ status: "paid", mpesa_receipt_number: meta.receiptNumber })
      .eq("id", order.id);
  } else {
    await supabase
      .from("orders")
      .update({ status: "failed", payment_failure_reason: callback.ResultDesc || "Payment was not completed." })
      .eq("id", order.id);
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
