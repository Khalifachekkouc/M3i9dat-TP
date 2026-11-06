import type { OrderItem, Product } from "./types";

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  /** Sauces this product may take (empty = no sauce question). */
  sauceChoices: string[];
  sauces: string[];
  /** True once the cashier picked sauces or explicitly "no sauce". */
  sauceChosen: boolean;
  note: string;
  noteOpen: boolean;
}

export type CartAction =
  | { type: "add"; product: Product; sauceChoices: string[] }
  | { type: "inc"; key: string }
  | { type: "dec"; key: string }
  | { type: "remove"; key: string }
  | { type: "toggleSauce"; key: string; sauce: string }
  | { type: "noSauce"; key: string }
  | { type: "note"; key: string; note: string }
  | { type: "toggleNote"; key: string }
  | { type: "clear" }
  | { type: "restore"; lines: CartLine[] };

let seq = 0;
const newKey = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const needsSauce = (l: CartLine) => l.sauceChoices.length > 0 && !l.sauceChosen;

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  const update = (key: string, fn: (l: CartLine) => CartLine) => lines.map((l) => (l.key === key ? fn(l) : l));

  switch (action.type) {
    case "add": {
      const { product, sauceChoices } = action;
      // Same product still waiting for its sauce, or a sauce-less product
      // without a note: one more of it. Otherwise a new line, so two tacos
      // can carry different sauces.
      const last = lines.at(-1);
      if (last && last.productId === product.id && sauceChoices.length > 0 && !last.sauceChosen && !last.note) {
        return update(last.key, (l) => ({ ...l, qty: l.qty + 1 }));
      }
      if (sauceChoices.length === 0) {
        const same = lines.find((l) => l.productId === product.id && !l.note);
        if (same) return update(same.key, (l) => ({ ...l, qty: l.qty + 1 }));
      }
      return [
        ...lines,
        {
          key: newKey(),
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
          sauceChoices,
          sauces: [],
          sauceChosen: sauceChoices.length === 0,
          note: "",
          noteOpen: false,
        },
      ];
    }
    case "inc":
      return update(action.key, (l) => ({ ...l, qty: Math.min(99, l.qty + 1) }));
    case "dec":
      return lines.flatMap((l) => (l.key !== action.key ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []));
    case "remove":
      return lines.filter((l) => l.key !== action.key);
    case "toggleSauce":
      return update(action.key, (l) => {
        const sauces = l.sauces.includes(action.sauce)
          ? l.sauces.filter((s) => s !== action.sauce)
          : // Keep the shop's sauce order (Tomate before Piquante) on the ticket.
            l.sauceChoices.filter((s) => s === action.sauce || l.sauces.includes(s));
        return { ...l, sauces, sauceChosen: sauces.length > 0 };
      });
    case "noSauce":
      return update(action.key, (l) => ({ ...l, sauces: [], sauceChosen: true }));
    case "note":
      return update(action.key, (l) => ({ ...l, note: action.note.slice(0, 120) }));
    case "toggleNote":
      return update(action.key, (l) => ({ ...l, noteOpen: !l.noteOpen }));
    case "clear":
      return [];
    case "restore":
      return action.lines;
  }
}

export const toOrderItems = (lines: CartLine[]): OrderItem[] =>
  lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    price: l.price,
    qty: l.qty,
    sauces: l.sauces,
    ...(l.note.trim() ? { note: l.note.trim() } : {}),
  }));

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

const STORAGE_KEY = "m3i9dat.cart.v1";

export function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]).filter((l) => l && typeof l.key === "string") : [];
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]) {
  try {
    if (lines.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Private mode or full storage: the cart still lives in memory.
  }
}
