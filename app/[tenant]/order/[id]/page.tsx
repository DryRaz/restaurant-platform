import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import OrderStatusClient from "@/components/OrderStatusClient";

export default async function OrderStatusPage({ params }: { params: { tenant: string; id: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return <OrderStatusClient restaurant={restaurant} orderId={params.id} />;
}
