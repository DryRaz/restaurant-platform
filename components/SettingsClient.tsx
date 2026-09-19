"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Restaurant } from "@/lib/tenant";

type PaymentForm = {
  mpesa_shortcode: string;
  mpesa_consumer_key: string;
  mpesa_consumer_secret: string;
  mpesa_passkey: string;
  mpesa_env: "sandbox" | "production";
  mpesa_transaction_type: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
};

const EMPTY: PaymentForm = {
  mpesa_shortcode: "",
  mpesa_consumer_key: "",
  mpesa_consumer_secret: "",
  mpesa_passkey: "",
  mpesa_env: "sandbox",
  mpesa_transaction_type: "CustomerPayBillOnline",
};

export default function SettingsClient({ restaurant }: { restaurant: Restaurant }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [form, setForm] = useState<PaymentForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = supabaseBrowser();

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push(`/${restaurant.slug}/login`);
        return;
      }
      const { data: staffRow } = await supabase
        .from("staff")
        .select("role")
        .eq("restaurant_id", restaurant.id)
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (staffRow?.role !== "owner") {
        setAllowed(false);
        setLoading(false);
        return;
      }
      setAllowed(true);

      const { data: config } = await supabase
        .from("restaurant_payment_config")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();

      if (config) {
        setForm({
          mpesa_shortcode: config.mpesa_shortcode || "",
          mpesa_consumer_key: config.mpesa_consumer_key || "",
          mpesa_consumer_secret: config.mpesa_consumer_secret || "",
          mpesa_passkey: config.mpesa_passkey || "",
          mpesa_env: config.mpesa_env,
          mpesa_transaction_type: config.mpesa_transaction_type,
        });
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await supabase
      .from("restaurant_payment_config")
      .upsert({ restaurant_id: restaurant.id, ...form, updated_at: new Date().toISOString() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="container">Loading...</div>;
  if (!allowed) return <div className="container">Only the restaurant owner can view this page.</div>;

  return (
    <div className="container">
      <h1>Payment settings</h1>
      <p>
        Enter your own Safaricom Daraja credentials here &mdash; get them from{" "}
        <a href="https://developer.safaricom.co.ke" target="_blank" rel="noreferrer">
          developer.safaricom.co.ke
        </a>
        . Nobody but you enters these.
      </p>

      <form onSubmit={handleSave} className="card">
        <Field label="Shortcode (Till or PayBill number)" value={form.mpesa_shortcode} onChange={(v) => setForm((f) => ({ ...f, mpesa_shortcode: v }))} />
        <Field label="Consumer key" value={form.mpesa_consumer_key} onChange={(v) => setForm((f) => ({ ...f, mpesa_consumer_key: v }))} />
        <Field label="Consumer secret" value={form.mpesa_consumer_secret} type="password" onChange={(v) => setForm((f) => ({ ...f, mpesa_consumer_secret: v }))} />
        <Field label="Passkey" value={form.mpesa_passkey} type="password" onChange={(v) => setForm((f) => ({ ...f, mpesa_passkey: v }))} />

        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Environment</label>
        <select
          value={form.mpesa_env}
          onChange={(e) => setForm((f) => ({ ...f, mpesa_env: e.target.value as PaymentForm["mpesa_env"] }))}
          style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
        >
          <option value="sandbox">Sandbox (testing)</option>
          <option value="production">Production (real payments)</option>
        </select>

        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Account type</label>
        <select
          value={form.mpesa_transaction_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, mpesa_transaction_type: e.target.value as PaymentForm["mpesa_transaction_type"] }))
          }
          style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
        >
          <option value="CustomerPayBillOnline">PayBill</option>
          <option value="CustomerBuyGoodsOnline">Till (Buy Goods)</option>
        </select>

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <>
      <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
      />
    </>
  );
}
