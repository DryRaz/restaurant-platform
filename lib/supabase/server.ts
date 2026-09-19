import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely -- server-only, never
 * imported from a Client Component. Used for anything that touches
 * orders, payments or M-Pesa credentials, mirroring the pattern that
 * proved out on sos-caffe (all money-related writes go through a
 * server API route with this client, never a direct anon write).
 *
 * .schema("platform") targets the platform schema. Requires "platform"
 * to be added to Project Settings -> Data API -> Exposed schemas in
 * the Supabase dashboard (alongside "public", which sos-caffe still
 * needs -- do not remove it).
 */
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "platform" },
  });
}
