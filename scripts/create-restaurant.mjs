// Provisions a new restaurant (tenant) on the platform: a row in
// platform.restaurants, an empty payment-config row for it to fill in
// from its own /kitchen/settings page, an owner auth user, and the
// staff row linking them.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node scripts/create-restaurant.mjs --name "Bella Vista" --slug bella-vista --owner-email owner@example.com
//
// Prints a temporary password for the owner to log in with and change
// (via Supabase Auth's normal password-reset flow) -- this script
// never asks you to hand Claude a password, and Claude never runs it
// on your behalf with a real key.

import { createClient } from "@supabase/supabase-js";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const name = arg("name");
const slug = arg("slug");
const ownerEmail = arg("owner-email");
const currency = arg("currency", "KES");

if (!name || !slug || !ownerEmail) {
  console.error("Usage: node scripts/create-restaurant.mjs --name \"Bella Vista\" --slug bella-vista --owner-email owner@example.com [--currency KES]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment first.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "platform" },
});

function randomPassword() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + "!1";
}

async function main() {
  const { data: existing } = await supabase.from("restaurants").select("id").eq("slug", slug).maybeSingle();
  if (existing) {
    console.error(`A restaurant with slug "${slug}" already exists.`);
    process.exit(1);
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({ name, slug, currency, status: "trial" })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    console.error("Failed to create restaurant:", restaurantError?.message);
    process.exit(1);
  }

  await supabase.from("restaurant_payment_config").insert({ restaurant_id: restaurant.id });

  const tempPassword = randomPassword();
  const { data: userResult, error: userError } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (userError || !userResult.user) {
    console.error("Failed to create owner account:", userError?.message);
    console.error(`Restaurant "${slug}" was created but has no owner yet -- add one manually via the staff table.`);
    process.exit(1);
  }

  await supabase.from("staff").insert({ restaurant_id: restaurant.id, user_id: userResult.user.id, role: "owner" });

  console.log("\nRestaurant created:");
  console.log(`  Name:  ${name}`);
  console.log(`  Slug:  ${slug}`);
  console.log(`  Path-based URL (works immediately):   https://<your-domain>/${slug}`);
  console.log(`  Subdomain URL (once DNS is set up):    https://${slug}.<your-domain>`);
  console.log(`\nOwner login:`);
  console.log(`  Email:            ${ownerEmail}`);
  console.log(`  Temporary password: ${tempPassword}`);
  console.log(`\nNext steps for the owner: log in at /${slug}/login, then go to /${slug}/kitchen/settings`);
  console.log("to enter their own M-Pesa Daraja credentials -- nothing works until they do.");
}

main();
