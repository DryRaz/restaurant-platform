"use client";

import Link from "next/link";
import { useCart, lineTotal } from "./CartProvider";
import type { Restaurant } from "@/lib/tenant";

function formatPrice(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

export default function CartClient({ restaurant }: { restaurant: Restaurant }) {
  const cart = useCart();

  return (
    <div className="container">
      <h1>Your order</h1>

      {cart.lines.length === 0 && (
        <p>
          Your cart is empty. <Link href={`/${restaurant.slug}`}>Back to menu</Link>
        </p>
      )}

      {cart.lines.map((line) => (
        <div key={line.key} className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {line.name}
                {line.variantLabel ? ` \u00b7 ${line.variantLabel}` : ""}
              </div>
              {line.modifiers.map((m) => (
                <div key={m.id} style={{ fontSize: 13, color: "var(--muted)" }}>
                  {m.name} {m.price > 0 ? `(+${formatPrice(m.price, restaurant.currency)})` : ""}
                </div>
              ))}
            </div>
            <button
              onClick={() => cart.removeLine(line.key)}
              style={{ background: "none", border: "none", color: "var(--danger)" }}
            >
              Remove
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button className="chip" onClick={() => cart.setQuantity(line.key, line.quantity - 1)}>
              &minus;
            </button>
            <span>{line.quantity}</span>
            <button className="chip" onClick={() => cart.setQuantity(line.key, line.quantity + 1)}>
              +
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ fontWeight: 600 }}>{formatPrice(lineTotal(line), restaurant.currency)}</div>
          </div>
        </div>
      ))}

      {cart.lines.length > 0 && (
        <>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Total</span>
            <span>{formatPrice(cart.total, restaurant.currency)}</span>
          </div>
          <Link href={`/${restaurant.slug}/checkout`} className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Checkout
          </Link>
        </>
      )}
    </div>
  );
}
