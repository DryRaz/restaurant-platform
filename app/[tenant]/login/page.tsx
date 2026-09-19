import { getRestaurantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";
import LoginClient from "@/components/LoginClient";

export default async function LoginPage({ params }: { params: { tenant: string } }) {
  const restaurant = await getRestaurantBySlug(params.tenant);
  if (!restaurant) notFound();

  return <LoginClient restaurant={restaurant} />;
}
