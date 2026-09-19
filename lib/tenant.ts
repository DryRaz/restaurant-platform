import { supabaseServer } from "./supabase/server";

export type Restaurant = {
    id: string;
    slug: string;
    name: string;
    currency: string;
    timezone: string;
    logo_url: string | null;
    primary_color: string;
    status: "trial" | "active" | "suspended";
};

/**
 * Looks up a restaurant by its slug (the [tenant] route param). Used
 * from Server Components / API routes -- never from the browser.
 * Returns null if the slug doesn't exist, so callers can 404 cleanly.
 */
export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, slug, name, currency, timezone, logo_url, primary_color, status")
      .eq("slug", slug)
      .maybeSingle();

  if (error || !data) return null;
    return data as Restaurant;
}
