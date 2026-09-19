"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartModifier = { id: string; name: string; price: number };
export type CartLine = {
  key: string; // menuItemId + variantLabel + sorted modifier ids, for merging identical lines
  menuItemId: string;
  name: string;
  variantLabel: string | null;
  unitPrice: number;
  quantity: number;
  modifiers: CartModifier[];
};

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "quantity">, quantity: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  total: number;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function lineTotal(line: CartLine): number {
  const modifiersTotal = line.modifiers.reduce((sum, m) => sum + m.price, 0);
  return (line.unitPrice + modifiersTotal) * line.quantity;
}

export function CartProvider({ tenant, children }: { tenant: string; children: React.ReactNode }) {
  const storageKey = `cart:${tenant}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // storage may be unavailable (private mode) -- cart still works in-memory
    }
  }, [lines, hydrated, storageKey]);

  const value = useMemo<CartContextValue>(() => {
    const addLine: CartContextValue["addLine"] = (line, quantity) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.key === line.key);
        if (existing) {
          return prev.map((l) =>
            l.key === line.key ? { ...l, quantity: l.quantity + quantity } : l
          );
        }
        return [...prev, { ...line, quantity }];
      });
    };

    const setQuantity: CartContextValue["setQuantity"] = (key, quantity) => {
      setLines((prev) =>
        quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
      );
    };

    const removeLine: CartContextValue["removeLine"] = (key) => {
      setLines((prev) => prev.filter((l) => l.key !== key));
    };

    const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

    return { lines, addLine, setQuantity, removeLine, clear: () => setLines([]), total, itemCount };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}

export { lineTotal };
