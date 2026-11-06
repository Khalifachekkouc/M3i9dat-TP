"use client";

import { collection, doc, runTransaction, serverTimestamp, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { dayKey } from "./i18n";
import { commitOrder, sameItems, type StoreLike } from "./order-core";
import type { OrderItem } from "./types";

export { orderTotal } from "./order-core";

export interface PlacedOrder {
  id: string;
  number: number;
  day: string;
  items: OrderItem[];
  total: number;
  /** Time printed on the tickets. */
  printedAt: Date;
  /** The order was already saved by an earlier attempt whose answer was lost. */
  alreadySaved: boolean;
  /** ...and the cart was edited since: the saved (and printed) items differ from the cart. */
  differs: boolean;
}

/** A Firestore auto-id (20 letters and digits), chosen before the first attempt. */
export const newOrderId = () => doc(collection(db, "orders")).id;

const firestoreStore: StoreLike = {
  runTransaction: (fn) =>
    runTransaction(db, (tx) =>
      fn({
        get: async (path) => {
          const snap = await tx.get(doc(db, path));
          return snap.exists() ? snap.data() : null;
        },
        set: (path, data) => {
          tx.set(doc(db, path), data);
        },
      }),
    ),
};

/**
 * Saves the cart under `orderId` with the next daily number. Retrying with the
 * same id after any failure returns the already-saved order instead of a copy.
 * Transactions need the server: offline, this rejects and the cart is kept.
 */
export async function placeOrder(orderId: string, items: OrderItem[], uid: string): Promise<PlacedOrder> {
  const result = await commitOrder(
    firestoreStore,
    { orderId, day: dayKey(new Date()), items, uid },
    serverTimestamp(),
  );
  if (result.status === "created") {
    return { id: orderId, ...pick(result), printedAt: new Date(), alreadySaved: false, differs: false };
  }
  const createdAt = result.data.createdAt as Timestamp | undefined;
  return {
    id: orderId,
    ...pick(result),
    printedAt: createdAt?.toDate?.() ?? new Date(),
    alreadySaved: true,
    differs: !sameItems(result.items, items),
  };
}

const pick = (r: { number: number; day: string; items: OrderItem[]; total: number }) => ({
  number: r.number,
  day: r.day,
  items: r.items,
  total: r.total,
});
