import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return <SettingsClient restaurant={restaurant} />;
}
