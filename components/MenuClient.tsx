"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "./CartProvider";
import type { Restaurant } from "@/lib/tenant";

type Category = {
  id: string;
  name: string;
  sort_order: number;
  background_color: string | null;
  text_color: string | null;
};
type Item = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  available: boolean;
};
type Variant = { id: string; menu_item_id: string; label: string; price: number };
type ItemModifierLink = { menu_item_id: string; modifier_id: string };
type Modifier = { id: string; name: string; price: number };

function formatPrice(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

// Relative luminance of a "#rrggbb" color, used only to decide whether
// this section's background is dark enough to need the light/inverted
// watermark logo instead of the default dark ink one.
function isDarkColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 140;
}

export default function MenuClient({
  restaurant,
  categories,
  items,
  variants,
  itemModifiers,
  modifiers,
}: {
  restaurant: Restaurant;
  categories: Category[];
  items: Item[];
  variants: Variant[];
  itemModifiers: ItemModifierLink[];
  modifiers: Modifier[];
}) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? "");
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const cart = useCart();

  const activeCat = categories.find((c) => c.id === activeCategory) ?? null;
  const sectionBg = activeCat?.background_color || restaurant.background_color;
  const sectionText = activeCat?.text_color || restaurant.text_color;
  const sectionIsDark = isDarkColor(sectionBg);

  const visibleItems = useMemo(
    () => items.filter((i) => i.category_id === activeCategory),
    [items, activeCategory]
  );

  return (
    <div>
      <header className="header">
        {restaurant.logo_url && <img src={restaurant.logo_url} alt="" className="logo" />}
        <div>
          <h1>{restaurant.name.toUpperCase()}</h1>
          <p>Order online &middot; Pay with M-Pesa</p>
        </div>
      </header>

      {/* This section's own background/text -- switches with the active
          category to match that page's look in the printed menu. Covers
          the tenant-wide theme underneath while this page is showing. */}
      <div
        key={activeCategory}
        className="menu-section"
        style={{ background: sectionBg, color: sectionText }}
      >
        {restaurant.logo_url && (
          <img
            src={restaurant.logo_url}
            alt=""
            className="menu-watermark"
            style={sectionIsDark ? { filter: "brightness(0) invert(1)" } : undefined}
          />
        )}

        <div className="tabs">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`tab ${c.id === activeCategory ? "active" : ""}`}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="container" style={{ paddingBottom: cart.itemCount ? 96 : 16, position: "relative" }}>
          {activeCat && <h2 className="section-title">{activeCat.name}</h2>}

          {visibleItems.map((item) => {
            const itemModifierNames = modifiers
              .filter((m) => itemModifiers.some((link) => link.menu_item_id === item.id && link.modifier_id === m.id))
              .map((m) => m.name);
            const extrasPreview =
              itemModifierNames.length > 3
                ? `${itemModifierNames.slice(0, 3).join(", ")} +${itemModifierNames.length - 3} more`
                : itemModifierNames.join(", ");

            return (
              <div key={item.id} className="card" style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  {item.description && (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{item.description}</div>
                  )}
                  <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
                    {variants
                      .filter((v) => v.menu_item_id === item.id)
                      .map((v) => formatPrice(v.price, restaurant.currency))
                      .join(" / ")}
                  </div>
                  {extrasPreview && (
                    <div style={{ fontSize: 12, color: "var(--brand)", marginTop: 6, fontWeight: 600 }}>
                      + Extras: {extrasPreview}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setOpenItem(item)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "none",
                    background: "var(--brand)",
                    color: "white",
                    fontSize: 18,
                    flexShrink: 0,
                    alignSelf: "center",
                  }}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {cart.itemCount > 0 && (
        <Link href={`/${restaurant.slug}/cart`} className="sticky-bar">
          <span>
            {cart.itemCount} item{cart.itemCount > 1 ? "s" : ""} &middot; {formatPrice(cart.total, restaurant.currency)}
          </span>
          <span>View cart &rarr;</span>
        </Link>
      )}

      {openItem && (
        <ItemModal
          item={openItem}
          restaurant={restaurant}
          variants={variants.filter((v) => v.menu_item_id === openItem.id)}
          modifiers={modifiers.filter((m) =>
            itemModifiers.some((link) => link.menu_item_id === openItem.id && link.modifier_id === m.id)
          )}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
}

function ItemModal({
  item,
  restaurant,
  variants,
  modifiers,
  onClose,
}: {
  item: Item;
  restaurant: Restaurant;
  variants: Variant[];
  modifiers: Modifier[];
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const cart = useCart();
  const needsChoice = /choice|choose|pick one|tell us/i.test(item.description || "");

  const variant = variants.find((v) => v.id === variantId);
  const chosenModifiers = modifiers.filter((m) => selectedModifiers.includes(m.id));
  const lineUnitPrice = (variant?.price ?? 0) + chosenModifiers.reduce((s, m) => s + m.price, 0);

  function toggleModifier(id: string) {
    setSelectedModifiers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function handleAdd() {
    if (!variant) return;
    const key = `${item.id}:${variant.label}:${[...selectedModifiers].sort().join(",")}`;
    cart.addLine(
      {
        key,
        menuItemId: item.id,
        name: item.name,
        variantLabel: variant.label,
        unitPrice: variant.price,
        modifiers: chosenModifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
        notes,
      },
      quantity
    );
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="container"
        style={{ background: "var(--bg)", borderRadius: "16px 16px 0 0", margin: 0, width: "100%" }}
      >
        <h2>{item.name}</h2>
        {item.description && (
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: -8 }}>{item.description}</p>
        )}

        {needsChoice && (
          <div style={{ fontWeight: 600, margin: "4px 0 6px" }}>
            Tell us your choices <span style={{ fontWeight: 400, color: "var(--muted)" }}>(required)</span>
          </div>
        )}
        <textarea
          className="notes-field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={needsChoice ? "e.g. Starter 1, Main 4, Iced tea" : "Notes for the kitchen (optional)"}
          style={needsChoice ? { borderColor: "var(--brand)", marginBottom: 12 } : { marginBottom: 12 }}
        />

        {variants.length > 0 && (
          <>
            <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Size</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {variants.map((v) => (
                <button
                  key={v.id}
                  className={`chip ${v.id === variantId ? "active" : ""}`}
                  onClick={() => setVariantId(v.id)}
                >
                  {v.label} &middot; {formatPrice(v.price, restaurant.currency)}
                </button>
              ))}
            </div>
          </>
        )}

        {modifiers.length > 0 && (
          <>
            <div style={{ fontWeight: 600, margin: "16px 0 6px" }}>Add extras</div>
            {modifiers.map((m) => (
              <label
                key={m.id}
                style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eee" }}
              >
                <span>
                  <input
                    type="checkbox"
                    checked={selectedModifiers.includes(m.id)}
                    onChange={() => toggleModifier(m.id)}
                    style={{ marginRight: 8 }}
                  />
                  {m.name}
                </span>
                <span style={{ color: "var(--muted)" }}>+{formatPrice(m.price, restaurant.currency)}</span>
              </label>
            ))}
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
          <button className="chip" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
            &minus;
          </button>
          <span>{quantity}</span>
          <button className="chip" onClick={() => setQuantity((q) => q + 1)}>
            +
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="btn-primary"
            style={{ width: "auto" }}
            onClick={handleAdd}
            disabled={!variant || (needsChoice && !notes.trim())}
          >
            Add &middot; {formatPrice(lineUnitPrice * quantity, restaurant.currency)}
          </button>
        </div>
      </div>
    </div>
  );
}
