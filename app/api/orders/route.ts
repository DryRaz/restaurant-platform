import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type IncomingLine = {
  menuItemId: string;
  variantLabel: string | null;
  quantity: number;
  modifiers: { id: string }[];
  choices?: { optionId: string }[];
  notes?: string;
};

const MAX_QUANTITY_PER_LINE = 50;

/**
 * Creates an order in "awaiting_payment". No payment is triggered here:
 * the customer pays the restaurant's Till from their own M-Pesa app, then
 * submits the confirmation code (see /api/orders/[id]/confirm-payment).
 *
 * Prices are NEVER taken from the browser. Only item ids, variant labels,
 * modifier ids and quantities are read from the request; every name and
 * price is looked up here from the database, so a tampered request can't
 * lower the amount the customer is asked to pay.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { restaurantSlug, customerName, customerPhone, lines } = (body || {}) as {
    restaurantSlug: string;
    customerName: string;
    customerPhone: string;
    lines: IncomingLine[];
  };

  if (!restaurantSlug || !customerPhone || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "Missing order details." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, status")
    .eq("slug", restaurantSlug)
    .maybeSingle();

  if (!restaurant || restaurant.status === "suspended") {
    return NextResponse.json({ error: "This restaurant is not accepting orders right now." }, { status: 404 });
  }

  const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
  const modifierIds = [...new Set(lines.flatMap((l) => (l.modifiers || []).map((m) => m.id)))];

  const [{ data: items }, { data: variants }, { data: modifiers }, { data: links }, { data: choiceGroups }] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, available")
      .eq("restaurant_id", restaurant.id)
      .in("id", itemIds),
    supabase.from("menu_item_variants").select("menu_item_id, label, price").eq("restaurant_id", restaurant.id).in("menu_item_id", itemIds),
    modifierIds.length
      ? supabase.from("modifiers").select("id, name, price").eq("restaurant_id", restaurant.id).in("id", modifierIds)
      : Promise.resolve({ data: [] as { id: string; name: string; price: number }[] }),
    supabase.from("menu_item_modifiers").select("menu_item_id, modifier_id").in("menu_item_id", itemIds),
    supabase
      .from("choice_groups")
      .select("id, menu_item_id, name, min_select, max_select, sort_order, choice_options(id, label, sort_order)")
      .eq("restaurant_id", restaurant.id)
      .in("menu_item_id", itemIds)
      .order("sort_order"),
  ]);

  const itemById = new Map((items || []).map((i) => [i.id, i]));
  const modifierById = new Map((modifiers || []).map((m) => [m.id, m]));

  const stale = NextResponse.json(
    { error: "Something in your cart is no longer available. Please review your order." },
    { status: 409 }
  );

  const resolved: {
    menuItemId: string;
    name: string;
    variantLabel: string | null;
    unitPrice: number;
    quantity: number;
    notes: string | null;
    modifiers: { name: string; price: number }[];
  }[] = [];

  for (const line of lines) {
    const item = itemById.get(line.menuItemId);
    if (!item || !item.available) return stale;

    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY_PER_LINE) {
      return NextResponse.json({ error: "Invalid quantity in your cart." }, { status: 400 });
    }

    const itemVariants = (variants || []).filter((v) => v.menu_item_id === item.id);
    const variant =
      itemVariants.find((v) => v.label === line.variantLabel) ??
      (line.variantLabel === null && itemVariants.length === 1 ? itemVariants[0] : undefined);
    if (!variant) return stale;

    const resolvedModifiers: { name: string; price: number }[] = [];
    for (const m of line.modifiers || []) {
      const modifier = modifierById.get(m.id);
      const allowed = (links || []).some((l) => l.menu_item_id === item.id && l.modifier_id === m.id);
      if (!modifier || !allowed) return stale;
      resolvedModifiers.push({ name: modifier.name, price: Number(modifier.price) });
    }

    // Ticked choices (e.g. a combo's side and drink): every option must belong
    // to one of this item's groups, and each group must be within its limits.
    // They're written into the line's notes ("Side: Coleslaw · Drink: ...") so
    // the kitchen, order page and daily report show them with no extra work.
    const chosenIds = new Set((line.choices || []).map((c) => c.optionId));
    const itemGroups = (choiceGroups || []).filter((g) => g.menu_item_id === item.id);
    const knownIds = new Set(itemGroups.flatMap((g) => (g.choice_options || []).map((o) => o.id)));
    if ([...chosenIds].some((id) => !knownIds.has(id))) return stale;

    const choiceParts: string[] = [];
    for (const group of itemGroups) {
      const picked = [...(group.choice_options || [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((o) => chosenIds.has(o.id));
      if (picked.length < group.min_select || picked.length > group.max_select) {
        return NextResponse.json(
          { error: `Please choose your ${group.name.toLowerCase()} for ${item.name}.` },
          { status: 400 }
        );
      }
      if (picked.length > 0) choiceParts.push(`${group.name}: ${picked.map((o) => o.label).join(", ")}`);
    }

    const customerNotes = typeof line.notes === "string" ? line.notes.trim().slice(0, 500) : "";
    const notes = [choiceParts.join(" · "), customerNotes].filter(Boolean).join(" — ");

    resolved.push({
      menuItemId: item.id,
      name: item.name,
      variantLabel: variant.label,
      unitPrice: Number(variant.price),
      quantity: line.quantity,
      notes: notes || null,
      modifiers: resolvedModifiers,
    });
  }

  const total = resolved.reduce((sum, l) => {
    const modifiersTotal = l.modifiers.reduce((s, m) => s + m.price, 0);
    return sum + (l.unitPrice + modifiersTotal) * l.quantity;
  }, 0);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      restaurant_id: restaurant.id,
      customer_name: customerName || null,
      customer_phone: customerPhone,
      status: "awaiting_payment",
      total,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
  }

  // Don't leave a half-saved order behind if any line fails to save.
  async function abort() {
    await supabase.from("orders").delete().eq("id", order!.id);
    return NextResponse.json({ error: "Could not save your order. Please try again." }, { status: 500 });
  }

  for (const line of resolved) {
    const { data: orderItem, error: itemError } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        restaurant_id: restaurant.id,
        menu_item_id: line.menuItemId,
        item_name: line.name,
        variant_label: line.variantLabel,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        notes: line.notes,
      })
      .select("id")
      .single();

    if (itemError || !orderItem) return abort();

    if (line.modifiers.length > 0) {
      const { error: modError } = await supabase.from("order_item_modifiers").insert(
        line.modifiers.map((m) => ({
          order_item_id: orderItem.id,
          restaurant_id: restaurant.id,
          name: m.name,
          price: m.price,
        }))
      );
      if (modError) return abort();
    }
  }

  return NextResponse.json({ orderId: order.id });
}