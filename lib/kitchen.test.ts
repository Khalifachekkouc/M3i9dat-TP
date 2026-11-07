import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPLETED_LIMIT, cardTiming, detectArrivals, previousDay, splitZones, type KitchenTimed } from "./kitchen";

const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const DAY = "2026-11-07";

const order = (n: number, over: Partial<KitchenTimed> = {}): KitchenTimed => ({
  id: `o${n}`,
  number: n,
  day: DAY,
  createdMs: T0,
  prepDurationSec: 300,
  status: "preparing",
  ...over,
});

const ids = (list: { id: string }[]) => list.map((o) => o.id);

// ---------- zones ----------

test("zones: a fresh order is in preparation until its own duration has passed", () => {
  const o = order(1);
  assert.deepEqual(ids(splitZones([o], T0, DAY).preparing), ["o1"]);
  assert.deepEqual(ids(splitZones([o], T0 + 299_999, DAY).preparing), ["o1"]);
  const at = splitZones([o], T0 + 300_000, DAY);
  assert.deepEqual(ids(at.preparing), []);
  assert.deepEqual(ids(at.completed), ["o1"]);
});

test("zones: auto-expired orders are completed 'auto' at createdAt + duration, with nothing written", () => {
  const o = order(1, { prepDurationSec: 120 });
  const [done] = splitZones([o], T0 + 10 * 60_000, DAY).completed;
  assert.equal(done.doneBy, "auto");
  assert.equal(done.doneMs, T0 + 120_000);
  assert.equal(o.status, "preparing", "the input is not mutated");
});

test("zones: a stored completion (« Terminé ») is manual, at its completedAt, even before the timer ends", () => {
  const o = order(1, { status: "completed", completedMs: T0 + 45_000, completedBy: "kitchen" });
  const z = splitZones([o], T0 + 50_000, DAY);
  assert.deepEqual(ids(z.preparing), []);
  assert.equal(z.completed[0].doneBy, "kitchen");
  assert.equal(z.completed[0].doneMs, T0 + 45_000);
});

test("zones: each order uses its own snapshot duration, not the current setting", () => {
  const old = order(1, { prepDurationSec: 600 }); // made when the setting was 10 min
  const fresh = order(2, { prepDurationSec: 60, createdMs: T0 + 1000 }); // made after it changed to 1 min
  const z = splitZones([old, fresh], T0 + 2 * 60_000, DAY);
  assert.deepEqual(ids(z.preparing), ["o1"], "the old order still has 8 minutes");
  assert.deepEqual(ids(z.completed), ["o2"]);
});

test("zones: orders without a status or duration (older data) default to preparing and 300 s", () => {
  const legacy = { id: "x", number: 9, day: DAY, createdMs: T0 } as KitchenTimed;
  assert.deepEqual(ids(splitZones([legacy], T0 + 299_000, DAY).preparing), ["x"]);
  assert.deepEqual(ids(splitZones([legacy], T0 + 300_000, DAY).completed), ["x"]);
});

test("zones: preparing oldest first, completed newest first", () => {
  const a = order(1, { createdMs: T0 });
  const b = order(2, { createdMs: T0 + 10_000 });
  const c = order(3, { createdMs: T0 + 20_000, status: "completed", completedMs: T0 + 30_000, completedBy: "kitchen" });
  const d = order(4, { createdMs: T0 - 600_000 }); // auto at T0 - 300_000
  const z = splitZones([b, c, a, d], T0 + 40_000, DAY);
  assert.deepEqual(ids(z.preparing), ["o1", "o2"]);
  assert.deepEqual(ids(z.completed), ["o3", "o4"]);
});

test("zones: « Terminées » keeps today's orders only, the last 20", () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    order(i + 1, { createdMs: T0 - 3_600_000 + i * 1000 }),
  );
  const yesterday = order(99, { day: previousDay(DAY), createdMs: T0 - 86_400_000 });
  const z = splitZones([...many, yesterday], T0, DAY);
  assert.equal(z.completed.length, COMPLETED_LIMIT);
  assert.equal(z.completed[0].id, "o25", "newest first");
  assert.ok(!ids(z.completed).includes("o99"), "yesterday's order is not shown");
});

test("zones: an order from just before midnight can still be in preparation", () => {
  const late = order(1, { day: previousDay(DAY), createdMs: T0, prepDurationSec: 600 });
  assert.deepEqual(ids(splitZones([late], T0 + 60_000, DAY).preparing), ["o1"]);
});

test("zones: pending writes without a server time are left out", () => {
  assert.equal(splitZones([order(1, { createdMs: null })], T0, DAY).preparing.length, 0);
});

// ---------- timing ----------

test("timing: counts against the order's own duration and flags the end", () => {
  const t = cardTiming(T0, T0 + 4 * 60_000 + 5_000, 300_000);
  assert.deepEqual(t.elapsed, { m: 4, s: 5 });
  assert.deepEqual(t.remaining, { m: 0, s: 55 });
  assert.equal(t.lastMinute, true);
  assert.ok(Math.abs(t.fraction - 55 / 300) < 1e-9);
  const short = cardTiming(T0, T0 + 20_000, 30_000); // 10 s left of 30
  assert.equal(short.lastMinute, true, "a 30 s order is urgent in its second half");
  assert.equal(cardTiming(T0, T0 + 5_000, 30_000).lastMinute, false);
});

test("timing clamps a createdAt slightly in the future", () => {
  const t = cardTiming(T0 + 800, T0, 300_000);
  assert.equal(t.elapsedMs, 0);
  assert.equal(t.fraction, 1);
});

test("previousDay crosses months and years", () => {
  assert.equal(previousDay("2026-11-07"), "2026-11-06");
  assert.equal(previousDay("2027-01-01"), "2026-12-31");
});

// ---------- new-order detection (flash + sound) ----------

test("arrivals: the initial load never counts as new", () => {
  const orders = [{ id: "a", createdMs: T0 }, { id: "b", createdMs: T0 + 1000 }];
  const r = detectArrivals(null, orders, T0 + 2000);
  assert.deepEqual(r.fresh, []);
  assert.deepEqual([...r.seen].sort(), ["a", "b"]);
});

test("arrivals: only an order not already on screen is new", () => {
  const first = detectArrivals(null, [{ id: "a", createdMs: T0 }], T0 + 1000);
  const second = detectArrivals(first.seen, [{ id: "a", createdMs: T0 }, { id: "b", createdMs: T0 + 5000 }], T0 + 6000);
  assert.deepEqual(second.fresh.map((o) => o.id), ["b"]);
  const third = detectArrivals(second.seen, [{ id: "a", createdMs: T0 }, { id: "b", createdMs: T0 + 5000 }], T0 + 7000);
  assert.deepEqual(third.fresh, []);
});

test("arrivals: an old order entering the query is not announced", () => {
  const first = detectArrivals(null, [], T0);
  const r = detectArrivals(first.seen, [{ id: "old", createdMs: T0 - 3 * 60_000 }], T0);
  assert.deepEqual(r.fresh, []);
  assert.ok(r.seen.has("old"));
});

test("arrivals: several orders in one snapshot are all new", () => {
  const first = detectArrivals(null, [], T0);
  const r = detectArrivals(first.seen, [{ id: "x", createdMs: T0 - 1000 }, { id: "y", createdMs: T0 - 500 }], T0);
  assert.deepEqual(r.fresh.map((o) => o.id), ["x", "y"]);
});
