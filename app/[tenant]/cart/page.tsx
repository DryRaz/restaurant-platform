import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { CartProvider } from "@/components/CartProvider";
import CartClient from "@/components/CartClient";

export default async function CartPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return (
    <CartProvider tenant={restaurant.slug}>
      <CartClient restaurant={restaurant} />
    </CartProvider>
  );
}
