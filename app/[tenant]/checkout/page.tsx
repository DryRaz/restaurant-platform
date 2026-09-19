import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { CartProvider } from "@/components/CartProvider";
import CheckoutClient from "@/components/CheckoutClient";

export default async function CheckoutPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return (
    <CartProvider tenant={restaurant.slug}>
      <CheckoutClient restaurant={restaurant} />
    </CartProvider>
  );
}
