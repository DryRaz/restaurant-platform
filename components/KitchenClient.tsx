"use client";

import { useEffect, useState } from "react";
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
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, status, total, created_at")
        .eq("restaurant_id", restaurant.id)
        .in("status", ["paid", "preparing", "ready"])
        .order("created_at", { ascending: true });
      setOrders(data || []);
    }

    loadOrders();

    const channel = supabase
      .channel(`orders-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "platform", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          playNewOrderChime();
          vibrate([150, 80, 150, 80, 150]);
          if (document.hidden) flashTabTitle("New order!");
          setBanner(`🔔 New order!`);
          setTimeout(() => setBanner(null), 6000);
          loadOrders();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "platform", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => loadOrders()
      )
      .subscribe();

    return () => {
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

      {orders.length === 0 && <p>No active orders right now.</p>}

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
    { item_name: string; variant_label: string | null; quantity: number; modifiers: { name: string; price: number }[] }[]
  >([]);
  const supabase = supabaseBrowser();

  useEffect(() => {
    async function load() {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("id, item_name, variant_label, quantity")
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
        <span>{order.customer_name || order.customer_phone}</span>
        <span>
          {restaurant.currency} {order.total.toLocaleString()}
        </span>
      </div>
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
