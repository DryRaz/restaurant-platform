"use client";

import { useEffect, useMemo, useState } from "react";
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

/**
 * Landing page of the password-reset e-mail link. The link signs the
 * person in (recovery session) and sends them here to choose a new
 * password. Accepts either the recovery event or an already-open session,
 * so it still works if the session was created a moment earlier.
 */
export default function ResetPasswordClient({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setChecking(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Same prefix logic as the login page: path-based URLs carry /<slug>,
  // subdomain URLs (middleware rewrites them) don't.
  function prefix() {
    return window.location.pathname.startsWith(`/${restaurant.slug}`) ? `/${restaurant.slug}` : "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("The update failed. Request a new link from the login page.");
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push(`${prefix()}/kitchen`), 1500);
  }

  if (checking) return <div className="container">Verifying link...</div>;

  if (!ready) {
    return (
      <div className="container">
        <h1>Invalid or expired link</h1>
        <p>Request a new reset link from the login page.</p>
        <button className="btn-primary" onClick={() => router.push(`${prefix()}/login`)}>
          Back to login
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container">
        <h1>Password updated</h1>
        <p>Taking you to the kitchen...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>{restaurant.name} &mdash; New password</h1>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>New password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          style={inputStyle}
          required
        />
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          style={inputStyle}
          required
        />
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save new password"}
        </button>
      </form>
    </div>
  );
}
