# Restaurant Platform

Multi-tenant online ordering base: one Next.js deployment serves every
restaurant, each isolated by row-level security in a shared "platform"
schema. Built using sos-caffe as a design reference, but this is a
separate, generic codebase -- sos-caffe's own repo, database schema
and Supabase project are untouched.

## Architecture

- **Database:** the *same* Supabase project as sos-caffe, but in its
  own `platform` Postgres schema (not `public`, which stays sos-caffe's).
  Every table carries a `restaurant_id`; Postgres RLS enforces that
  staff only ever see their own restaurant's data.
- **Tenant routing:** `middleware.ts` resolves a restaurant from either
  `slug.yourdomain.com` (subdomain, once wildcard DNS is set up) or
  `yourdomain.com/slug` (path-based, works immediately, no DNS needed).
  Both work at the same time.
- **Payments:** manual M-Pesa payment, no Daraja/STK push. Each restaurant
  is either a Till (Buy Goods) or a Paybill (business number + account
  number), set at `/[slug]/kitchen/settings` (owner-only). After placing
  an order the customer sees a pop-up with the payment details and
  amount, pays from their own M-Pesa app, and pastes the confirmation
  code. The order then goes to the kitchen as "paid" with the code shown
  on its card, and staff check it against their payment notification before preparing.
  The code is not verified against Safaricom; one code can only ever pay
  for one order (unique index on `orders.mpesa_receipt_number`).
- **Staff roles:** `owner` (full access + payment settings),
  `admin` (menu management), `kitchen` / `cashier` (order handling).

## One-time setup (you do this, not Claude)

1. **Expose the `platform` schema.** In the Supabase dashboard for the
   sos-caffe project: Project Settings -> Data API -> Data API Settings
   -> "Exposed schemas" -> add `platform` (keep `public` -- sos-caffe
   still needs it). Without this the app can't reach any table.

2. **Create a new Vercel project** from this repo (separate from the
   sos-caffe Vercel project).

3. **Environment variables** on the new Vercel project (copy the values
   from the sos-caffe project's own settings -- same Supabase project):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_BASE_DOMAIN` (e.g. `orderbase.app` -- whatever domain
     you point at this deployment)
   - `NEXT_PUBLIC_APP_URL` (e.g. `https://orderbase.app`, used to build
     the M-Pesa callback URL)

4. **Wildcard domain (optional, for subdomains).** In Vercel: Project ->
   Domains -> add `*.orderbase.app` alongside `orderbase.app`, then add
   the wildcard `CNAME`/`A` record your registrar's DNS asks for. Until
   this is done, every restaurant is still reachable at
   `orderbase.app/<slug>` -- nothing blocks you from onboarding
   restaurants before the wildcard is live.

5. **Add a new restaurant** (you, from your own machine, once per
   client):
   ```
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     npm run create-restaurant -- --name "Bella Vista" --slug bella-vista --owner-email owner@example.com
   ```
   This prints a temporary password for the owner. They log in at
   `/bella-vista/login`, then go to `/bella-vista/kitchen/settings` and
   enter their own M-Pesa credentials -- ordering won't work until they
   do (the checkout flow fails cleanly with a clear message if it's
   incomplete, it never crashes).

## What's included

- Public ordering flow: menu with categories, sizes/variants, extras,
  cart, checkout, manual M-Pesa Till payment, live order-status page with
  ready-alert (chime + vibration + tab flash), "stay on this page"
  guard.
- Staff dashboard: login, realtime new-order alerts, order status
  progression, daily sales report (PDF).
- Owner-only payment settings page.
- Tenant provisioning script.

## What's deliberately not built yet

- Self-serve signup (you provision each restaurant with the script).
- A UI for editing the menu (menu rows are inserted directly in
  Supabase for now, same starting point sos-caffe had).
- Custom domains per restaurant (the `restaurants` table and routing
  are structured so this can be added later without a rewrite).