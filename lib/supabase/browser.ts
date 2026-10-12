import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<any, any, any> | null = null;

/**
 * Anon-key client for Client Components: public menu reads, and the
 * staff login/session (RLS-scoped by auth.uid() from there on).
 *
 * One shared instance. Components call this on every render; creating a
 * new client each time spawned duplicate auth clients fighting over the
 * same stored session.
 */
export function supabaseBrowser() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      db: { schema: "platform" },
    });
  }
  return client;
}
