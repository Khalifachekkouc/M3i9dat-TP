/**
 * Order saving, independent of Firebase so the retry rules can be unit-tested.
 *
 * The order's document id is chosen by the client before the first attempt
 * and reused on every retry. Inside one transaction:
 *   - if orders/{id} already exists, the first attempt reached the server
 *     (only its answer was lost): return that order, write nothing;
 *   - otherwise take the next daily number from counters/{day} and write the
 *     counter and the order together.
 * So re-validating after a network drop can never create a second order.
 */
import { isValidPrepDuration } from "./kitchen-settings";
import type { OrderItem } from "./types";

export type DocData = Record<string, unknown>;

export interface TxLike {
  get(path: string): Promise<DocData | null>;
  set(path: string, data: DocData): void;
}

export interface StoreLike {
  runTransaction<T>(fn: (tx: TxLike) => Promise<T>): Promise<T>;
}

export interface CommitInput {
  orderId: string;
  /** Shop day, YYYY-MM-DD. */
  day: string;
  items: OrderItem[];
  uid: string;
  /** settings/kitchen.prepDurationSec read by the cashier screen; copied onto the order. */
  prepDurationSec: number;
}

export type CommitResult =
  | { status: "created"; orderId: string; number: number; day: string; items: OrderItem[]; total: number }
  | { status: "existing"; orderId: string; number: number; day: string; items: OrderItem[]; total: number; data: DocData };

export const orderTotal = (items: OrderItem[]) =>
  Math.round(items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;

/** Only the fields the data model allows, no empty notes (Firestore rejects undefined). */
export function cleanItems(items: OrderItem[]): OrderItem[] {
  return items.map((i) => ({
    productId: i.productId,
    name: i.name,
    price: i.price,
    qty: i.qty,
    sauces: [...i.sauces],
    ...(i.note && i.note.trim() ? { note: i.note.trim() } : {}),
  }));
}

/** True when two item lists describe the same order (used to warn after a lost confirmation). */
export function sameItems(a: OrderItem[], b: OrderItem[]): boolean {
  const key = (items: OrderItem[]) =>
    JSON.stringify(cleanItems(items).map((i) => [i.productId, i.qty, i.price, i.sauces, i.note ?? ""]));
  return key(a) === key(b);
}

/**
 * @param serverTime the value stored as createdAt (Firestore: serverTimestamp()).
 */
export async function commitOrder(store: StoreLike, input: CommitInput, serverTime: unknown): Promise<CommitResult> {
  if (!isValidPrepDuration(input.prepDurationSec)) throw new Error(`invalid prepDurationSec: ${input.prepDurationSec}`);
  const items = cleanItems(input.items);
  const total = orderTotal(items);
  const orderPath = `orders/${input.orderId}`;
  const counterPath = `counters/${input.day}`;

  return store.runTransaction(async (tx) => {
    // All reads first: Firestore transactions require reads before writes.
    const existing = await tx.get(orderPath);
    if (existing) {
      return {
        status: "existing",
        orderId: input.orderId,
        number: Number(existing.number),
        day: String(existing.day),
        items: Array.isArray(existing.items) ? (existing.items as OrderItem[]) : [],
        total: Number(existing.total),
        data: existing,
      };
    }
    const counter = await tx.get(counterPath);
    const number = (Number(counter?.value) || 0) + 1;
    tx.set(counterPath, { value: number, lastOrderId: input.orderId });
    // The prep duration is snapshotted: a later change of the setting does not touch this order.
    tx.set(orderPath, {
      number,
      day: input.day,
      items,
      total,
      createdAt: serverTime,
      createdBy: input.uid,
      status: "preparing",
      prepDurationSec: input.prepDurationSec,
    });
    return { status: "created", orderId: input.orderId, number, day: input.day, items, total };
  });
}

// ---------------------------------------------------------------------------
// The pending order id: persisted until the save is confirmed, so a reload or
// a retry after a network error reuses it.

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PENDING_KEY = "m3i9dat.pendingOrderId.v1";

export function readPendingOrderId(storage: KeyValueStore): string | null {
  try {
    return storage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/** The id the current cart will be saved under: the stored one, or a new one stored now. */
export function pendingOrderId(storage: KeyValueStore, createId: () => string): string {
  const existing = readPendingOrderId(storage);
  if (existing) return existing;
  const id = createId();
  try {
    storage.setItem(PENDING_KEY, id);
  } catch {
    // No storage (private mode): the id still lives for this attempt.
  }
  return id;
}

/** After a confirmed save, or when the cashier explicitly starts a new cart. */
export function clearPendingOrderId(storage: KeyValueStore) {
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    // Nothing stored.
  }
}
