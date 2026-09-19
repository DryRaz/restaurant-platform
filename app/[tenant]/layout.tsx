import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/tenant";

// Google Fonts family name -> the exact CSS2 query string it needs
// (weights vary per family). Add an entry here whenever a new tenant
// picks a font that isn't already listed.
const GOOGLE_FONT_QUERY: Record<string, string> = {
  Rye: "Rye&display=swap",
  "Courier Prime": "Courier+Prime:wght@400;700&display=swap",
};

function googleFontsHref(fonts: (string | null)[]): string | null {
  const families = fonts
    .filter((f): f is string => !!f && f in GOOGLE_FONT_QUERY)
    .map((f) => `family=${GOOGLE_FONT_QUERY[f]}`);
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

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

  const fontsHref = googleFontsHref([restaurant.heading_font, restaurant.body_font]);

  return (
    <div
      className={`tenant-theme texture-${restaurant.texture}`}
      style={
        {
          "--brand": restaurant.primary_color,
          "--bg": restaurant.background_color,
          "--text": restaurant.text_color,
          "--font-heading": restaurant.heading_font
            ? `"${restaurant.heading_font}", var(--font-heading-fallback)`
            : "var(--font-heading-fallback)",
          "--font-body": restaurant.body_font
            ? `"${restaurant.body_font}", var(--font-body-fallback)`
            : "var(--font-body-fallback)",
        } as React.CSSProperties
      }
    >
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      {children}
    </div>
  );
}
