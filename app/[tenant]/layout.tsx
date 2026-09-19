import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/tenant";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  const restaurant = await getRestaurantBySlug(params.tenant);

  if (!restaurant || restaurant.status === "suspended") {
    notFound();
  }

  return (
    <div style={{ ["--brand" as any]: restaurant.primary_color }}>
      {children}
    </div>
  );
}
