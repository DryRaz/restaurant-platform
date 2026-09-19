"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Restaurant } from "@/lib/tenant";

export default function LoginClient({ restaurant }: { restaurant: Restaurant }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = supabaseBrowser();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError("Incorrect email or password.");
      setSubmitting(false);
      return;
    }

    const { data: staffRow } = await supabase
      .from("staff")
      .select("role")
      .eq("restaurant_id", restaurant.id)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (!staffRow) {
      await supabase.auth.signOut();
      setError("This account isn't staff at this restaurant.");
      setSubmitting(false);
      return;
    }

    router.push(`/${restaurant.slug}/kitchen`);
    router.refresh();
  }

  return (
    <div className="container">
      <h1>{restaurant.name} &mdash; Staff login</h1>
      <form onSubmit={handleLogin}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
          required
        />
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
          required
        />
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
