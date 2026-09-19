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
  awaiting_payment: "Waiting for M-Pesa confirmation...",
  paid: "Payment received — your order is in the queue",
  preparing: "Being prepared",
  ready: "Ready for pickup!",
  completed: "Completed — thank you!",
  failed: "Payment did not go through",
  expired: "Payment request expired",
};

const ACTIVE_STATUSES = ["awaiting_payment", "paid", "preparing"];

export default function OrderStatusClient({ restaurant, orderId }: { restaurant: Restaurant; orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [retrying, setRetrying] = useState(false);
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

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch(`/api/orders/${orderId}/retry-payment`, { method: "POST" });
    } finally {
      setRetrying(false);
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

  return (
    <div className="container">
      <h1>Order status</h1>

      <div className="card">
        <div style={{ fontSize: 18, fontWeight: 700 }}>{STATUS_LABEL[order.status] || order.status}</div>
        {order.payment_failure_reason && (
          <p style={{ color: "var(--danger)" }}>{order.payment_failure_reason}</p>
        )}
        {(order.status === "failed" || order.status === "expired") && (
          <button className="btn-primary" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Sending prompt..." : "Try payment again"}
          </button>
        )}
      </div>

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
