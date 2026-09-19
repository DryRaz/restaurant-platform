import { getRestaurantBySlug } from "@/lib/tenant";
import { supabaseServer } from "@/lib/supabase/server";
import { CartProvider } from "@/components/CartProvider";
import MenuClient from "@/components/MenuClient";
import { notFound } from "next/navigation";

export default async function MenuPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  const supabase = supabaseServer();

  const [{ data: categories }, { data: items }, { data: variants }, { data: itemModifiers }, { data: modifiers }] =
    await Promise.all([
      supabase
        .from("menu_categories")
        .select("id, name, sort_order, background_color, text_color")
        .eq("restaurant_id", restaurant.id)
        .order("sort_order"),
      supabase
        .from("menu_items")
        .select("id, category_id, name, description, image_url, available, sort_order")
        .eq("restaurant_id", restaurant.id)
        .eq("available", true)
        .order("sort_order"),
      supabase
        .from("menu_item_variants")
        .select("id, menu_item_id, label, price")
        .eq("restaurant_id", restaurant.id),
      supabase
        .from("menu_item_modifiers")
        .select("menu_item_id, modifier_id")
        .eq("restaurant_id", restaurant.id),
      supabase.from("modifiers").select("id, name, price").eq("restaurant_id", restaurant.id),
    ]);

  return (
    <CartProvider tenant={restaurant.slug}>
      <MenuClient
        restaurant={restaurant}
        categories={categories || []}
        items={items || []}
        variants={variants || []}
        itemModifiers={itemModifiers || []}
        modifiers={modifiers || []}
      />
    </CartProvider>
  );
}
