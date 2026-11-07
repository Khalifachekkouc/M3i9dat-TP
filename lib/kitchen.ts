import { DEFAULT_PREP_SEC, prepDurationOrDefault } from "./kitchen-settings";

const MINUTE = 60 * 1000;

/** « Terminées » keeps only the most recent ones. */
export const COMPLETED_LIMIT = 20;

export interface KitchenTimed {
  id: string;
  number: number;
  /** Shop day, YYYY-MM-DD. */
  day: string;
  /** Server time of creation, in ms. Null while a write is pending. */
  createdMs: number | null;
  /** Snapshot of settings/kitchen taken when the order was created. Older orders have none. */
  prepDurationSec?: number;
  /** Stored status. Missing on orders made before statuses existed: treated as "preparing". */
  status?: "preparing" | "completed";
  /** Server time of the « Terminé » tap, in ms. */
  completedMs?: number | null;
  completedBy?: "kitchen" | "auto";
}

export type Placed<T> = T & {
  /** When it left « En préparation »: the tap, or createdAt + its prep duration. */
  doneMs: number;
  /** "kitchen" = someone tapped « Terminé »; "auto" = the timer ran out (derived, never written). */
  doneBy: "kitchen" | "auto";
};

export const prepMsOf = (o: Pick<KitchenTimed, "prepDurationSec">) =>
  prepDurationOrDefault(o.prepDurationSec ?? DEFAULT_PREP_SEC) * 1000;

/**
 * Splits the day's orders into the two kitchen zones at `serverNow`.
 * - stored "completed": completed (manual), at its completedAt;
 * - still "preparing" but createdAt + its own prep duration has passed:
 *   completed (auto). Derived here, so it holds after a refresh and even if no
 *   kitchen screen was open when the timer ran out. Nothing is written.
 * - otherwise: preparing.
 * Preparing: oldest first. Completed: today's only, newest first, the last 20.
 */
export function splitZones<T extends KitchenTimed>(orders: T[], serverNow: number, today: string) {
  const preparing: T[] = [];
  const completed: Placed<T>[] = [];
  for (const o of orders) {
    if (o.createdMs === null) continue;
    const autoAt = o.createdMs + prepMsOf(o);
    if (o.status === "completed") {
      completed.push({ ...o, doneMs: o.completedMs ?? Math.min(autoAt, serverNow), doneBy: o.completedBy === "auto" ? "auto" : "kitchen" });
    } else if (serverNow >= autoAt) {
      completed.push({ ...o, doneMs: autoAt, doneBy: "auto" });
    } else {
      preparing.push(o);
    }
  }
  preparing.sort((a, b) => a.createdMs! - b.createdMs! || a.number - b.number);
  const done = completed
    .filter((o) => o.day === today)
    .sort((a, b) => b.doneMs - a.doneMs || b.number - a.number)
    .slice(0, COMPLETED_LIMIT);
  return { preparing, completed: done };
}

/** Countdown of one preparing order, against its own prep duration. */
export function cardTiming(createdMs: number, serverNow: number, durationMs: number) {
  // A small residual clock error can put createdAt a moment in the future.
  const elapsedMs = Math.min(durationMs, Math.max(0, serverNow - createdMs));
  const remainingMs = durationMs - elapsedMs;
  const elapsedS = Math.floor(elapsedMs / 1000);
  const remainingS = Math.ceil(remainingMs / 1000);
  return {
    elapsedMs,
    remainingMs,
    /** 1 when the order arrives, 0 when it completes. */
    fraction: durationMs > 0 ? remainingMs / durationMs : 0,
    lastMinute: remainingMs <= Math.min(MINUTE, durationMs / 2),
    elapsed: { m: Math.floor(elapsedS / 60), s: elapsedS % 60 },
    remaining: { m: Math.floor(remainingS / 60), s: remainingS % 60 },
  };
}

/** The day before a YYYY-MM-DD key (an order made just before midnight can still be in preparation). */
export function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** An order counts as "new" (flash + sound) only if it was created this recently. */
export const NEW_WINDOW_MS = 30 * 1000;

/**
 * Which orders in a snapshot just arrived.
 * - First snapshot after load (`seen` is null): nothing is new, everything is remembered.
 * - Later: an order is new if it was never seen before AND was created within
 *   NEW_WINDOW_MS of `serverNow`. The second condition keeps older orders quiet
 *   when the query moves (day change) or a listener reconnects.
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
