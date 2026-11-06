/** Each order stays on the kitchen screen for exactly this long after createdAt. */
export const DISPLAY_MS = 5 * 60 * 1000;
const MINUTE = 60 * 1000;

export interface Timed {
  number: number;
  /** Server time of creation, in ms. Null while a write is pending. */
  createdMs: number | null;
}

/** Orders still inside their 5 minutes at `serverNow`, oldest first. */
export function visibleOrders<T extends Timed>(orders: T[], serverNow: number): T[] {
  return orders
    .filter((o) => o.createdMs !== null && serverNow - o.createdMs < DISPLAY_MS)
    .sort((a, b) => a.createdMs! - b.createdMs! || a.number - b.number);
}

export function cardTiming(createdMs: number, serverNow: number) {
  // A small residual clock error can put createdAt a moment in the future.
  const elapsedMs = Math.min(DISPLAY_MS, Math.max(0, serverNow - createdMs));
  const remainingMs = DISPLAY_MS - elapsedMs;
  const elapsedS = Math.floor(elapsedMs / 1000);
  const remainingS = Math.ceil(remainingMs / 1000);
  return {
    elapsedMs,
    remainingMs,
    /** 1 when the order arrives, 0 when it leaves. */
    fraction: remainingMs / DISPLAY_MS,
    lastMinute: remainingMs <= MINUTE,
    elapsed: { m: Math.floor(elapsedS / 60), s: elapsedS % 60 },
    remaining: { m: Math.floor(remainingS / 60), s: remainingS % 60 },
  };
}

/**
 * Lower bound for the Firestore query, rounded down to the minute and one
 * minute early, so the query (and its listener) only changes once a minute
 * and an imperfect clock offset never hides a live order.
 */
export function queryCutoffMs(serverNow: number): number {
  return Math.floor((serverNow - DISPLAY_MS) / MINUTE) * MINUTE - MINUTE;
}

/** An order counts as "new" (flash + sound) only if it was created this recently. */
export const NEW_WINDOW_MS = 30 * 1000;

/**
 * Which orders in a snapshot just arrived.
 * - First snapshot after load (`seen` is null): nothing is new, everything is remembered.
 * - Later: an order is new if it was never seen before AND was created within
 *   NEW_WINDOW_MS of `serverNow`. The second condition keeps older orders quiet
 *   when the query window moves back (first clock sync) or a listener reconnects.
 */
export function detectArrivals<T extends { id: string; createdMs: number | null }>(
  seen: ReadonlySet<string> | null,
  orders: T[],
  serverNow: number,
): { seen: Set<string>; fresh: T[] } {
  if (seen === null) return { seen: new Set(orders.map((o) => o.id)), fresh: [] };
  const next = new Set(seen);
  const fresh: T[] = [];
  for (const o of orders) {
    if (next.has(o.id)) continue;
    next.add(o.id);
    if (o.createdMs === null || o.createdMs >= serverNow - NEW_WINDOW_MS) fresh.push(o);
  }
  return { seen: next, fresh };
}
