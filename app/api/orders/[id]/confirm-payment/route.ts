import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// M-Pesa confirmation codes are 10 characters, letters and digits, starting
// with a letter (e.g. SJK3ABC12D). Customers often paste the whole SMS
// ("SJK3ABC12D Confirmed. Ksh100.00 paid to ..."), so pull the code out of it.
function extractReceiptCode(input: string): string | null {
  const candidates = input.toUpperCase().match(/\b[A-Z][A-Z0-9]{9}\b/g) ?? [];
  return candidates.find((c) => /\d/.test(c)) ?? null;
}

/**
 * The customer pays the restaurant's Till from their own M-Pesa app, then
 * submits the confirmation code here. There is no automatic link between
 * the Till and this app, so the code is NOT verified against Safaricom:
 * the order moves to "paid" with the code attached, and the kitchen
 * checks it against the Till's M-Pesa SMS (amount included) before
 * handing the order over. What this route does guarantee: the code has
 * the right shape, and one code can never pay for two orders.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? extractReceiptCode(body.code) : null;

  if (!code) {
    return NextResponse.json(
      { error: "Enter the 10-character M-Pesa confirmation code, e.g. SJK3ABC12D." },
      { status: 400 }
    );
  }

  const supabase = supabaseServer();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "awaiting_payment") {
    return NextResponse.json({ error: "This order has already been paid." }, { status: 409 });
  }

  const alreadyUsed = NextResponse.json(
    { error: "This M-Pesa code has already been used for another order." },
    { status: 409 }
  );

  const { data: reused } = await supabase
    .from("orders")
    .select("id")
    .eq("mpesa_receipt_number", code)
    .neq("id", order.id)
    .limit(1);
  if (reused && reused.length > 0) return alreadyUsed;

  // Only move the order on if it is still unpaid, so a double submit can't
  // overwrite a code that was already accepted.
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "paid", mpesa_receipt_number: code, payment_failure_reason: null })
    .eq("id", order.id)
    .eq("status", "awaiting_payment")
    .select("id");

  if (updateError) {
    // 23505 = unique_violation: another order claimed this code between the
    // check above and this update.
    if (updateError.code === "23505") return alreadyUsed;
    return NextResponse.json({ error: "Could not save your payment. Please try again." }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "This order has already been paid." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
