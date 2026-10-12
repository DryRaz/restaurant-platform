import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import ResetPasswordClient from "@/components/ResetPasswordClient";

export default async function ResetPasswordPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return <ResetPasswordClient restaurant={restaurant} />;
}
