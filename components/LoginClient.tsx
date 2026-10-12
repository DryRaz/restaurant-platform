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
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [info, setInfo] = useState<string | null>(null);
  const router = useRouter();

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    // Path-based URLs carry /<slug>; subdomain URLs (rewritten by the
    // middleware) don't, so build the link from where the person actually is.
    const prefix = window.location.pathname.startsWith(`/${restaurant.slug}`) ? `/${restaurant.slug}` : "";
    const supabase = supabaseBrowser();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${prefix}/reset-password`,
    });

    // Same message whether or not the account exists, so this form can't
    // be used to find out which e-mails are registered.
    setInfo("If an account exists with this e-mail, a reset link has just been sent to it.");
    setSubmitting(false);
  }

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

  if (mode === "forgot") {
    return (
      <div className="container">
        <h1>{restaurant.name} &mdash; Reset password</h1>
        <form onSubmit={handleForgot}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 16 }}
            required
          />
          {info && <p>{info}</p>}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send reset link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setInfo(null);
              setError(null);
            }}
            style={{ width: "100%", marginTop: 12, background: "none", border: "none", textDecoration: "underline", color: "inherit", fontSize: 14 }}
          >
            Back to login
          </button>
        </form>
      </div>
    );
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
        <button
          type="button"
          onClick={() => {
            setMode("forgot");
            setError(null);
          }}
          style={{ width: "100%", marginTop: 12, background: "none", border: "none", textDecoration: "underline", color: "inherit", fontSize: 14 }}
        >
          Forgot your password?
        </button>
      </form>
    </div>
  );
}
