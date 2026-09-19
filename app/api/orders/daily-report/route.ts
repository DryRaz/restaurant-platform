import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import PDFDocument from "pdfkit";

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!restaurantId || !token) {
    return NextResponse.json({ error: "Missing restaurant or auth token." }, { status: 400 });
  }

  // Verify the caller is actually signed in and staff at this restaurant
  // before using the service role client to pull the numbers.
  const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data: staffRow } = await supabase
    .from("staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!staffRow) {
    return NextResponse.json({ error: "Not staff at this restaurant." }, { status: 403 });
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, currency, timezone")
    .eq("id", restaurantId)
    .maybeSingle();

  const timezone = restaurant?.timezone || "Africa/Nairobi";
  const todayInTz = new Date().toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const startOfDay = new Date(`${todayInTz}T00:00:00`);
  const endOfDay = new Date(`${todayInTz}T23:59:59.999`);

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, total, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "paid")
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString())
    .order("created_at");

  const orderIds = (orders || []).map((o) => o.id);
  const { data: items } = orderIds.length
    ? await supabase
        .from("order_items")
        .select("id, order_id, item_name, variant_label, unit_price, quantity, notes")
        .in("order_id", orderIds)
    : { data: [] };

  const itemIds = (items || []).map((i) => i.id);
  const { data: modifiers } = itemIds.length
    ? await supabase.from("order_item_modifiers").select("order_item_id, name, price").in("order_item_id", itemIds)
    : { data: [] };

  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const currency = restaurant?.currency || "KES";
  doc.fontSize(18).text(`${restaurant?.name || "Restaurant"} — Daily Report`, { align: "left" });
  doc.fontSize(11).fillColor("#555").text(todayInTz);
  doc.moveDown();

  let total = 0;
  for (const order of orders || []) {
    total += Number(order.total);
    doc.fillColor("#000").fontSize(12).text(
      `#${order.order_number ?? "-"}  ${order.customer_name || "Customer"}  —  ${currency} ${Number(
        order.total
      ).toLocaleString()}  (${new Date(order.created_at).toLocaleTimeString("en-GB", { timeZone: timezone })})`
    );
    const orderItems = (items || []).filter((i) => i.order_id === order.id);
    for (const item of orderItems) {
      doc.fontSize(10).fillColor("#333").text(
        `   ${item.quantity}x ${item.item_name}${item.variant_label ? ` (${item.variant_label})` : ""}`
      );
      const itemModifiers = (modifiers || []).filter((m) => m.order_item_id === item.id);
      for (const mod of itemModifiers) {
        doc.fontSize(9).fillColor("#666").text(
          `      + ${mod.name}${mod.price > 0 ? ` (+${currency} ${mod.price})` : ""}`
        );
      }
      if (item.notes) {
        doc.fontSize(9).fillColor("#666").text(`      note: ${item.notes}`);
      }
    }
    doc.moveDown(0.5);
  }

  doc.moveDown();
  doc.fontSize(13).fillColor("#000").text(`Orders: ${(orders || []).length}`);
  doc.fontSize(13).text(`Total revenue: ${currency} ${total.toLocaleString()}`);

  doc.end();

  const buffer: Buffer = await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="daily-report-${todayInTz}.pdf"`,
    },
  });
}
