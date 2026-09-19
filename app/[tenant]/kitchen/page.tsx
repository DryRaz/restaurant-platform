import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import KitchenClient from "@/components/KitchenClient";

export default async function KitchenPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return <KitchenClient restaurant={restaurant} />;
}
