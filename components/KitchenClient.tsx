"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Restaurant } from "@/lib/tenant";
import { playNewOrderChime, vibrate, flashTabTitle } from "@/lib/notify";

type OrderRow = {
  id: string;
  order_number: number | null;
  customer_name: string | null;
  customer_phone: string;
  status: string;
  total: number;
  mpesa_receipt_number: string | null;
  created_at: string;
};

const NEXT_STATUS: Record<string, string | null> = {
  paid: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
};

const ACTION_LABEL: Record<string, string> = {
  paid: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark completed",
};

export default function KitchenClient({ restaurant }: { restaurant: Restaurant }) {
  const [role, setRole] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Every order id the screen has ever listed. null until the first load, so
  // orders already waiting when the page opens don't trigger the chime.
  const seenOrderIds = useRef<Set<string> | null>(null);
  const router = useRouter();

  const supabase = supabaseBrowser();

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push(`/${restaurant.slug}/login`);
        return;
      }
      const { data: staffRow } = await supabase
        .from("staff")
        .select("role")
        .eq("restaurant_id", restaurant.id)
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (!staffRow) {
        router.push(`/${restaurant.slug}/login`);
        return;
      }
      setRole(staffRow.role);
      setCheckingAuth(false);
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (checkingAuth) return;

    async function loadOrders() {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, status, total, mpesa_receipt_number, created_at")
        .eq("restaurant_id", restaurant.id)
        .in("status", ["paid", "preparing", "ready"])
        .order("created_at", { ascending: true });

      if (error) {
        // Keep what is already on screen rather than blanking it on a hiccup.
        setLoadError(true);
        return;
      }
      setLoadError(false);
      const rows = (data || []) as OrderRow[];
      setOrders(rows);

      // A new order is one that shows up in "paid" for the first time. This
      // works the same whether the page learned about it from realtime or
      // from the polling below, so it can never chime twice or not at all.
      if (seenOrderIds.current) {
        const fresh = rows.filter((o) => o.status === "paid" && !seenOrderIds.current!.has(o.id));
        if (fresh.length > 0) {
          playNewOrderChime();
          vibrate([150, 80, 150, 80, 150]);
          if (document.hidden) flashTabTitle("New order!");
          const n = fresh[fresh.length - 1].order_number;
          setBanner(`🔔 New order${n ? ` #${n}` : ""}!`);
          setTimeout(() => setBanner(null), 6000);
        }
      }
      seenOrderIds.current = new Set([...Array.from(seenOrderIds.current || []), ...rows.map((o) => o.id)]);
    }

    loadOrders();

    // Realtime gives instant updates; the poll is the safety net so a new
    // paid order always appears within a few seconds even if the realtime
    // connection is down or was never authorised.
    const poll = setInterval(loadOrders, 5000);

    const channel = supabase
      .channel(`orders-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "platform", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => loadOrders()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "platform", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth]);

  async function advance(order: OrderRow) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await supabase.from("orders").update({ status: next }).eq("id", order.id);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(`/${restaurant.slug}/login`);
  }

  async function handleDailyReport() {
    setGeneratingReport(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`/api/orders/daily-report?restaurantId=${restaurant.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Report failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not generate the daily report. Try again in a moment.");
    } finally {
      setGeneratingReport(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="container">
        <p>Checking access...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{restaurant.name} &mdash; Kitchen</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {role === "owner" && (
            <Link href={`/${restaurant.slug}/kitchen/settings`} className="chip">
              Settings
            </Link>
          )}
          <button className="chip" onClick={handleDailyReport} disabled={generatingReport}>
            {generatingReport ? "Generating..." : "📄 Daily report"}
          </button>
          <button className="chip" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      {banner && (
        <div className="card" style={{ background: "#fff4d6", border: "2px solid gold", fontWeight: 700 }}>
          {banner}
        </div>
      )}

      {loadError && (
        <p style={{ color: "var(--danger)", fontSize: 14 }}>Can&apos;t reach the server &mdash; retrying...</p>
      )}

      {orders.length === 0 && !loadError && <p>No active orders right now.</p>}

      {orders.map((order) => (
        <OrderCard key={order.id} order={order} restaurant={restaurant} onAdvance={() => advance(order)} />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  restaurant,
  onAdvance,
}: {
  order: OrderRow;
  restaurant: Restaurant;
  onAdvance: () => void;
}) {
  const [items, setItems] = useState<
    {
      item_name: string;
      variant_label: string | null;
      quantity: number;
      modifiers: { name: string; price: number }[];
      notes: string | null;
    }[]
  >([]);
  const supabase = supabaseBrowser();

  useEffect(() => {
    async function load() {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("id, item_name, variant_label, quantity, notes")
        .eq("order_id", order.id);
      const ids = (orderItems || []).map((i) => i.id);
      const { data: modifiers } = ids.length
        ? await supabase.from("order_item_modifiers").select("order_item_id, name, price").in("order_item_id", ids)
        : { data: [] };

      setItems(
        (orderItems || []).map((i) => ({
          item_name: i.item_name,
          variant_label: i.variant_label,
          quantity: i.quantity,
          modifiers: (modifiers || []).filter((m) => m.order_item_id === i.id),
          notes: i.notes,
        }))
      );
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const nextAction = ACTION_LABEL[order.status];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>
          {order.order_number ? `#${order.order_number} · ` : ""}
          {order.customer_name || order.customer_phone}
        </span>
        <span>
          {restaurant.currency} {order.total.toLocaleString()}
        </span>
      </div>
      {order.mpesa_receipt_number && (
        <div style={{ margin: "8px 0", padding: "8px 10px", borderRadius: 8, background: "#fff4d6", fontSize: 14 }}>
          M-Pesa code:{" "}
          <span style={{ fontWeight: 700, letterSpacing: "0.08em" }}>{order.mpesa_receipt_number}</span>
          {order.status === "paid" && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Check the code and amount ({restaurant.currency} {order.total.toLocaleString()}) in your payment notification before preparing.
            </div>
          )}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} style={{ padding: "4px 0" }}>
          <div>
            {item.quantity}&times; {item.item_name}
            {item.variant_label ? ` (${item.variant_label})` : ""}
          </div>
          {item.modifiers.map((m, j) => (
            <div key={j} style={{ fontWeight: 700, color: "var(--brand)", fontSize: 14 }}>
              + {m.name}
            </div>
          ))}
          {item.notes && (
            <div style={{ fontWeight: 700, color: "var(--danger)", fontSize: 14 }}>📝 {item.notes}</div>
          )}
        </div>
      ))}
      {nextAction && (
        <button className="btn-primary" onClick={onAdvance} style={{ marginTop: 10 }}>
          {nextAction}
        </button>
      )}
    </div>
  );
}
