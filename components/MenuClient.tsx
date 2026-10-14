"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "./CartProvider";
import type { Restaurant } from "@/lib/tenant";

type Category = {
  id: string;
  name: string;
  sort_order: number;
  background_color: string | null;
  text_color: string | null;
  note: string | null; // shown under the section title, e.g. "Drinks are not included."
};
type Item = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  gluten_free: boolean;
  available: boolean;
};
type Variant = { id: string; menu_item_id: string; label: string; price: number };
type ItemModifierLink = { menu_item_id: string; modifier_id: string };
type Modifier = { id: string; name: string; price: number };
type ChoiceGroup = {
  id: string;
  menu_item_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
};
type ChoiceOption = { id: string; group_id: string; label: string; sort_order: number };

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
  choiceGroups,
  choiceOptions,
}: {
  restaurant: Restaurant;
  categories: Category[];
  items: Item[];
  variants: Variant[];
  itemModifiers: ItemModifierLink[];
  modifiers: Modifier[];
  choiceGroups: ChoiceGroup[];
  choiceOptions: ChoiceOption[];
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
          {activeCat?.note && <p className="section-note">{activeCat.note}</p>}

          {visibleItems.map((item) => {
            const itemModifierNames = modifiers
              .filter((m) => itemModifiers.some((link) => link.menu_item_id === item.id && link.modifier_id === m.id))
              .map((m) => m.name);
            const includedPreview = [
              ...new Set(
                choiceGroups
                  .filter((g) => g.menu_item_id === item.id)
                  .map((g) => g.name.replace(/^Person \d+ · /, "").toLowerCase())
              ),
            ].join(", ");
            const extrasPreview =
              itemModifierNames.length > 3
                ? `${itemModifierNames.slice(0, 3).join(", ")} +${itemModifierNames.length - 3} more`
                : itemModifierNames.join(", ");

            return (
              <div key={item.id} className="card" style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {item.name}
                    {item.gluten_free && <span className="badge-gluten-free">Gluten free</span>}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{item.description}</div>
                  )}
                  <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
                    {variants
                      .filter((v) => v.menu_item_id === item.id)
                      .map((v) => formatPrice(v.price, restaurant.currency))
                      .join(" / ")}
                  </div>
                  {includedPreview && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                      Includes your choice of {includedPreview}
                    </div>
                  )}
                  {extrasPreview && (
                    <div style={{ fontSize: 12, color: "var(--brand)", marginTop: 6, fontWeight: 600 }}>
                      + Optional extras: {extrasPreview}
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
          choiceGroups={choiceGroups.filter((g) => g.menu_item_id === openItem.id)}
          choiceOptions={choiceOptions}
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
  choiceGroups,
  choiceOptions,
  onClose,
}: {
  item: Item;
  restaurant: Restaurant;
  variants: Variant[];
  modifiers: Modifier[];
  choiceGroups: ChoiceGroup[];
  choiceOptions: ChoiceOption[];
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  // Ticked option ids, per choice group.
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const cart = useCart();

  const optionsByGroup = (groupId: string) => choiceOptions.filter((o) => o.group_id === groupId);
  const missingGroups = choiceGroups.filter((g) => (chosen[g.id]?.length ?? 0) < g.min_select);

  function toggleChoice(group: ChoiceGroup, optionId: string) {
    setChosen((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      // Single-choice group: ticking another box swaps the choice.
      if (group.max_select === 1) return { ...prev, [group.id]: [optionId] };
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  const variant = variants.find((v) => v.id === variantId);
  const chosenModifiers = modifiers.filter((m) => selectedModifiers.includes(m.id));
  const lineUnitPrice = (variant?.price ?? 0) + chosenModifiers.reduce((s, m) => s + m.price, 0);

  function toggleModifier(id: string) {
    setSelectedModifiers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function handleAdd() {
    if (!variant || missingGroups.length > 0) return;
    const choices = choiceGroups.flatMap((g) =>
      optionsByGroup(g.id)
        .filter((o) => chosen[g.id]?.includes(o.id))
        .map((o) => ({ optionId: o.id, group: g.name, label: o.label }))
    );
    const choiceKey = choices.map((c) => c.optionId).join(",");
    const key = `${item.id}:${variant.label}:${[...selectedModifiers].sort().join(",")}:${choiceKey}`;
    cart.addLine(
      {
        key,
        menuItemId: item.id,
        name: item.name,
        variantLabel: variant.label,
        unitPrice: variant.price,
        modifiers: chosenModifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
        choices,
        notes,
      },
      quantity
    );
    onClose();
  }

  // Keep the page behind from scrolling while the sheet is open, so scrolling
  // inside the sheet never drags the menu with it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);


  return (
    <div className="item-overlay" onClick={onClose}>
      <div className="item-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="item-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        {/* Scrolls on its own; the quantity / Add bar below never scrolls away,
            so the button is always reachable however long the item is. */}
        <div className="item-sheet-body">
          <h2 style={{ margin: "0 32px 8px 0" }}>{item.name}</h2>
          {item.gluten_free && (
            <div style={{ margin: "-4px 0 8px" }}>
              <span className="badge-gluten-free" style={{ marginLeft: 0 }}>Gluten free</span>
            </div>
          )}
          {item.description && (
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>{item.description}</p>
          )}

          {variants.length > 1 && (
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

          {/* What the price already covers -- kept visually apart from the paid
              extras below so nobody thinks picking a side costs more. */}
          {choiceGroups.length > 0 && (
            <section className="choice-panel included-panel">
              <div className="choice-panel-title">
                Included in your order
                <span className="tag-included">No extra charge</span>
              </div>
              {choiceGroups.map((g) => {
                const picked = chosen[g.id] ?? [];
                const missing = picked.length < g.min_select;
                const hint =
                  g.max_select === 1
                    ? "choose 1"
                    : g.min_select === g.max_select
                    ? `choose ${g.max_select}`
                    : `up to ${g.max_select}`;
                return (
                  <div key={g.id} className="choice-group">
                    <div className="choice-group-title">
                      {g.name}
                      <span className={missing ? "choice-hint missing" : "choice-hint"}>
                        {missing ? `${hint} · required` : "✓"}
                      </span>
                    </div>
                    {optionsByGroup(g.id).map((o) => (
                      <label key={o.id} className={`option-row ${picked.includes(o.id) ? "selected" : ""}`}>
                        <span>
                          <input
                            type="checkbox"
                            checked={picked.includes(o.id)}
                            onChange={() => toggleChoice(g, o.id)}
                            style={{ marginRight: 8 }}
                          />
                          {o.label}
                        </span>
                        <span className="option-price included">Included</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </section>
          )}

          {modifiers.length > 0 && (
            <section className="choice-panel extras-panel">
              <div className="choice-panel-title">
                Add extras
                <span className="tag-extra">Optional · added to the price</span>
              </div>
              {modifiers.map((m) => (
                <label key={m.id} className={`option-row ${selectedModifiers.includes(m.id) ? "selected" : ""}`}>
                  <span>
                    <input
                      type="checkbox"
                      checked={selectedModifiers.includes(m.id)}
                      onChange={() => toggleModifier(m.id)}
                      style={{ marginRight: 8 }}
                    />
                    {m.name}
                  </span>
                  <span className="option-price">+{formatPrice(m.price, restaurant.currency)}</span>
                </label>
              ))}
            </section>
          )}

          <div style={{ fontWeight: 600, margin: "16px 0 6px" }}>
            Special requests <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          </div>
          <textarea
            className="notes-field"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. no onions, extra sauce…"
            style={{ marginBottom: 12 }}
          />
        </div>

        <div className="item-sheet-footer">
          {missingGroups.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 8 }}>
              Choose your {missingGroups.map((g) => g.name.toLowerCase()).join(", ")} to add this item.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="chip" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              &minus;
            </button>
            <span>{quantity}</span>
            <button className="chip" onClick={() => setQuantity((q) => q + 1)}>
              +
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn-primary" style={{ width: "auto" }} onClick={handleAdd} disabled={!variant || missingGroups.length > 0}>
              Add &middot; {formatPrice(lineUnitPrice * quantity, restaurant.currency)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
