"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart, lineTotal } from "./CartProvider";
import type { Restaurant } from "@/lib/tenant";

function formatPrice(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

export default function CheckoutClient({ restaurant }: { restaurant: Restaurant }) {
  const cart = useCart();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    if (!phone.trim()) {
      setError("Enter the phone number to receive the M-Pesa prompt on.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          customerName: name,
          customerPhone: phone,
          lines: cart.lines,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not create the order.");
        setSubmitting(false);
        return;
      }
      cart.clear();
      router.push(`/${restaurant.slug}/order/${json.orderId}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <h1>Checkout</h1>
      <p>You&apos;ll get an M-Pesa prompt on your phone to confirm payment.</p>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Order summary</div>
        {cart.lines.map((line) => (
          <div key={line.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <span>
              {line.quantity}&times; {line.name}
              {line.variantLabel ? ` (${line.variantLabel})` : ""}
            </span>
            <span>{formatPrice(lineTotal(line), restaurant.currency)}</span>
          </div>
        ))}
      </div>

      <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Phone number</label>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="07XX XXX XXX"
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
      />

      <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
        First name <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional &mdash; so we can call you)</span>
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
      />

      <div className="card" style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Total</span>
        <span>{formatPrice(cart.total, restaurant.currency)}</span>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <button className="btn-primary" onClick={handlePay} disabled={submitting || cart.lines.length === 0}>
        {submitting ? "Sending M-Pesa prompt..." : "Pay with M-Pesa"}
      </button>
    </div>
  );
}
