import { createClient } from "@supabase/supabase-js";

/**
 * Anon-key client for Client Components: public menu reads, and the
  * staff login/session (RLS-scoped by auth.uid() from there on).
   */
   export function supabaseBrowser() {
     const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
       const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

         return createClient(url, anonKey, {
             db: { schema: "platform" },
               });
               }
