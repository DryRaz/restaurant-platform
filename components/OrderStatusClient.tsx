"use client";

import { useEffect, useRef, useState } from "react";
import type { Restaurant } from "@/lib/tenant";
import { playReadyChime, vibrate, flashTabTitle } from "@/lib/notify";

type OrderItem = {
  id: string;
  item_name: string;
  variant_label: string | null;
  unit_price: number;
  quantity: number;
  modifiers: { name: string; price: number }[];
  notes: string | null;
};

type Order = {
  id: string;
  status: string;
  total: number;
  payment_failure_reason: string | null;
  items: OrderItem[];
};

function formatPrice(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Waiting for your payment",
  paid: "Order received — it's in the queue",
  preparing: "Being prepared",
  ready: "Ready for pickup!",
  completed: "Completed — thank you!",
  failed: "Payment did not go through",
  expired: "Payment not completed",
};

const ACTIVE_STATUSES = ["awaiting_payment", "paid", "preparing"];

export default function OrderStatusClient({ restaurant, orderId }: { restaurant: Restaurant; orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(true);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const previousStatus = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: Order = await res.json();
        if (previousStatus.current && previousStatus.current !== "ready" && data.status === "ready") {
          playReadyChime();
          vibrate([200, 100, 200]);
          flashTabTitle("Your order is ready!");
        }
        previousStatus.current = data.status;
        setOrder(data);
      } catch {
        // transient network error -- next poll tick will retry
      }
    }

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId]);

  useEffect(() => {
    if (!order || !ACTIVE_STATUSES.includes(order.status)) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [order]);

  async function handleConfirmPayment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not confirm your payment. Please try again.");
      }
      setOrder((o) => (o ? { ...o, status: "paid" } : o));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not confirm your payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const [copied, setCopied] = useState<string | null>(null);

  async function handleCopy(value: string | null, which: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked -- the number is on screen to type in by hand.
    }
  }

  function handleBackToMenu(e: React.MouseEvent) {
    if (order && ACTIVE_STATUSES.includes(order.status)) {
      const proceed = confirm("You'll miss the alert when your order is ready. Leave anyway?");
      if (!proceed) e.preventDefault();
    }
  }

  if (!order) {
    return (
      <div className="container">
        <p>Loading your order...</p>
      </div>
    );
  }

  const isActive = ACTIVE_STATUSES.includes(order.status);
  const needsPayment = order.status === "awaiting_payment";
  const isPaybill = restaurant.payment_type === "paybill";

  return (
    <div className="container">
      <h1>Order status</h1>

      <div className="card">
        <div style={{ fontSize: 18, fontWeight: 700 }}>{STATUS_LABEL[order.status] || order.status}</div>
        {order.payment_failure_reason && (
          <p style={{ color: "var(--danger)" }}>{order.payment_failure_reason}</p>
        )}
        {needsPayment && (
          <>
            <p style={{ fontSize: 14, margin: "6px 0 12px" }}>
              Pay with M-Pesa, then enter your confirmation code to send your order to the kitchen.
            </p>
            {!paymentOpen && (
              <button className="btn-primary" onClick={() => setPaymentOpen(true)}>
                Pay with M-Pesa
              </button>
            )}
          </>
        )}
      </div>

      {needsPayment && paymentOpen && (
        <div className="pay-overlay">
          <form className="pay-sheet" onSubmit={handleConfirmPayment}>
            <h2 style={{ margin: "0 0 10px" }}>Pay with M-Pesa</h2>
            <ol style={{ margin: "0 0 14px", paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
              <li>Open M-Pesa on your phone</li>
              {isPaybill ? (
                <>
                  <li>
                    Go to <strong>Lipa na M-Pesa</strong> &rarr; <strong>Pay Bill</strong>
                  </li>
                  <li>Enter the Business number, then the Account number, then the amount, then your PIN</li>
                </>
              ) : (
                <>
                  <li>
                    Go to <strong>Lipa na M-Pesa</strong> &rarr; <strong>Buy Goods and Services</strong>
                  </li>
                  <li>Enter the Till number and amount below, then your PIN</li>
                </>
              )}
              <li>Copy the confirmation code from the M-Pesa SMS and paste it here</li>
            </ol>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: isPaybill ? 10 : 14 }}>
              <div className="pay-box">
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{isPaybill ? "Business number" : "Till number"}</div>
                {restaurant.payment_number ? (
                  <>
                    <button type="button" onClick={() => handleCopy(restaurant.payment_number, "number")} className="pay-till">
                      {restaurant.payment_number}
                    </button>
                    <div style={{ fontSize: 12, color: "var(--brand)" }}>{copied === "number" ? "Copied!" : "Tap to copy"}</div>
                  </>
                ) : (
                  <div style={{ marginTop: 4, fontSize: 14 }}>Ask at the counter</div>
                )}
              </div>
              {isPaybill ? (
                <div className="pay-box">
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Account number</div>
                  {restaurant.payment_account ? (
                    <>
                      <button type="button" onClick={() => handleCopy(restaurant.payment_account, "account")} className="pay-till">
                        {restaurant.payment_account}
                      </button>
                      <div style={{ fontSize: 12, color: "var(--brand)" }}>{copied === "account" ? "Copied!" : "Tap to copy"}</div>
                    </>
                  ) : (
                    <div style={{ marginTop: 4, fontSize: 14 }}>Ask at the counter</div>
                  )}
                </div>
              ) : (
                <div className="pay-box">
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Amount</div>
                  <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700 }}>
                    {formatPrice(order.total, restaurant.currency)}
                  </div>
                </div>
              )}
            </div>
            {isPaybill && (
              <div className="pay-box" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Amount to pay</div>
                <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700 }}>
                  {formatPrice(order.total, restaurant.currency)}
                </div>
              </div>
            )}

            <label htmlFor="mpesa-code" style={{ display: "block", fontSize: 14, marginBottom: 6, fontWeight: 600 }}>
              M-Pesa confirmation code
            </label>
            <input
              id="mpesa-code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. SJK3ABC12D"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #ccc",
                fontFamily: "inherit",
                fontSize: 16,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#1a1a1a",
                background: "#fff",
              }}
              required
            />
            {submitError && <p style={{ color: "var(--danger)", fontSize: 14, margin: "8px 0 0" }}>{submitError}</p>}

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || code.trim().length === 0}
              style={{ marginTop: 14 }}
            >
              {submitting ? "Confirming..." : "Confirm payment"}
            </button>
            <button
              type="button"
              onClick={() => setPaymentOpen(false)}
              style={{ width: "100%", marginTop: 8, padding: 8, background: "none", border: "none", textDecoration: "underline", color: "inherit", fontSize: 14 }}
            >
              I&apos;ll do it in a moment
            </button>
          </form>
        </div>
      )}

      {isActive && (
        <div
          className="card"
          style={{ border: "2px solid var(--brand)", background: "#fffaf0", fontWeight: 600 }}
        >
          Stay on this page &mdash; you&apos;ll be alerted the moment your order is ready.
        </div>
      )}

      <div className="card">
        {order.items.map((item) => (
          <div key={item.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                {item.quantity}&times; {item.item_name}
                {item.variant_label ? ` (${item.variant_label})` : ""}
              </span>
              <span>
                {formatPrice(
                  (item.unit_price + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity,
                  restaurant.currency
                )}
              </span>
            </div>
            {item.modifiers.map((m, i) => (
              <div key={i} style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
                {m.name}
                {m.price > 0 ? ` (+${formatPrice(m.price, restaurant.currency)})` : ""}
              </div>
            ))}
            {item.notes && (
              <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>Note: {item.notes}</div>
            )}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: 10 }}>
          <span>Total</span>
          <span>{formatPrice(order.total, restaurant.currency)}</span>
        </div>
      </div>

      <a href={`/${restaurant.slug}`} onClick={handleBackToMenu}>
        &larr; Back to menu
      </a>
    </div>
  );
}