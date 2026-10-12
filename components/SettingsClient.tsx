"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Restaurant } from "@/lib/tenant";

const inputStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #ddd",
  marginBottom: 16,
  fontFamily: "inherit",
  fontSize: 16,
  color: "#1a1a1a",
  background: "#fff",
} as const;

export default function SettingsClient({ restaurant }: { restaurant: Restaurant }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [type, setType] = useState<"till" | "paybill">(restaurant.payment_type);
  const [number, setNumber] = useState(restaurant.payment_number || "");
  const [account, setAccount] = useState(restaurant.payment_account || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

      setAllowed(staffRow?.role === "owner");
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const cleanedNumber = number.replace(/\s+/g, "");
    const cleanedAccount = account.trim();

    if (cleanedNumber && !/^\d{5,10}$/.test(cleanedNumber)) {
      setError("The number is 5 to 10 digits, with no letters.");
      return;
    }
    if (type === "paybill" && cleanedNumber && !cleanedAccount) {
      setError("A Paybill needs an account number too.");
      return;
    }

    setSaving(true);
    const { data, error: saveError } = await supabase
      .from("restaurants")
      .update({
        payment_type: type,
        payment_number: cleanedNumber || null,
        payment_account: type === "paybill" ? cleanedAccount || null : null,
      })
      .eq("id", restaurant.id)
      .select("id");
    setSaving(false);

    if (saveError || !data || data.length === 0) {
      setError("Could not save. Make sure you are signed in as the owner and try again.");
      return;
    }
    setNumber(cleanedNumber);
    setAccount(type === "paybill" ? cleanedAccount : "");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="container">Loading...</div>;
  if (!allowed) return <div className="container">Only the restaurant owner can view this page.</div>;

  return (
    <div className="container">
      <h1>Payment settings</h1>
      <p>
        Customers pay from their own M-Pesa app, then enter the confirmation code on the order page. The kitchen sees
        that code on each order and checks it against your payment notification before preparing it.
      </p>

      <form onSubmit={handleSave} className="card">
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>How customers pay</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "till" | "paybill")}
          style={inputStyle}
        >
          <option value="till">Till number (Buy Goods)</option>
          <option value="paybill">Paybill (business number + account number)</option>
        </select>

        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
          {type === "paybill" ? "Business number" : "Till number"}
        </label>
        <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" style={inputStyle} />

        {type === "paybill" && (
          <>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Account number</label>
            <input value={account} onChange={(e) => setAccount(e.target.value)} style={inputStyle} />
          </>
        )}

        {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </form>
    </div>
  );
}