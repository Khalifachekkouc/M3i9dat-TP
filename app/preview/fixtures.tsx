"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import seed from "@/seed/products.json";
import { dayKey } from "@/lib/i18n";
import { orderTotal, type PlacedOrder } from "@/lib/orders";
import { PreviewContext, type PreviewData } from "@/lib/preview-context";
import { DEFAULT_SAUCES, type Order, type OrderItem, type Product } from "@/lib/types";

/** The real menu snapshot from Glovo (seed/products.json). */
export const previewProducts: Product[] = seed.products.map((p, i) => ({
  id: `glovo-${p.sourceId ?? i}`,
  name: p.name,
  price: p.price,
  category: p.category,
  imageUrl: p.imageUrl,
  available: p.available,
  sauceOptions: p.sauceOptions,
  order: (i + 1) * 10,
  createdAt: null,
}));

const item = (index: number, qty: number, sauces: string[], note?: string): OrderItem => {
  const p = previewProducts[index % previewProducts.length];
  return { productId: p.id, name: p.name, price: p.price, qty, sauces: p.sauceOptions.length ? sauces : [], ...(note ? { note } : {}) };
};

/** Sample orders (preview only), aged relative to `now`. */
export function previewOrders(now: number): Order[] {
  const day = dayKey(new Date(now));
  const make = (number: number, ageMs: number, items: OrderItem[]): Order => ({
    id: `${day}-${number}`,
    number,
    day,
    items,
    total: items.reduce((s, i) => s + i.price * i.qty, 0),
    createdAt: Timestamp.fromMillis(now - ageMs),
    createdBy: "preview",
  });
  return [
    make(1, 3 * 3600_000, [item(8, 2, ["Tomate"]), item(19, 2, [])]),
    make(2, 2 * 3600_000, [item(0, 1, ["Tomate", "Piquante"])]),
    make(3, 4 * 60_000 + 40_000, [item(8, 1, ["Piquante"]), item(14, 1, [])]),
    make(4, 3 * 60_000, [item(4, 1, ["Tomate", "Piquante"]), item(10, 2, ["Tomate"], "sans oignon"), item(18, 2, [])]),
    make(5, 90_000, [item(12, 3, ["Piquante"])]),
    make(6, 12_000, [item(1, 1, ["Tomate"]), item(16, 4, []), item(20, 1, [])]),
  ];
}

const noop = () => () => {};

/** Fixtures depend on the clock and on localStorage: render them in the browser only. */
export function ClientOnly({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <>{children}</> : null;
}

/** A sample order for /preview/tickets: N° 007 with Arabic names, both sauces, a note, a drink. */
export function previewPlacedOrder(): PlacedOrder {
  const items = [item(8, 2, ["Tomate", "Piquante"], "sans oignon"), item(4, 1, ["Piquante"]), item(12, 1, []), item(18, 2, [])];
  return {
    id: "preview-007",
    number: 7,
    day: dayKey(new Date()),
    items,
    total: orderTotal(items),
    printedAt: new Date(),
    alreadySaved: false,
    differs: false,
  };
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [data] = useState<PreviewData>(() => {
    // Local stand-in for the Firestore save: a per-day counter, nothing leaves the page.
    const counters = new Map<string, number>();
    return {
      products: previewProducts,
      sauces: [...DEFAULT_SAUCES],
      orders: previewOrders(Date.now()),
      placeOrder: async (orderId, items) => {
        const day = dayKey(new Date());
        const number = (counters.get(day) ?? 0) + 1;
        counters.set(day, number);
        return { id: orderId, number, day, items, total: orderTotal(items), printedAt: new Date(), alreadySaved: false, differs: false };
      },
    };
  });
  return <PreviewContext.Provider value={data}>{children}</PreviewContext.Provider>;
}
