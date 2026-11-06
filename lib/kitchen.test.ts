import { test } from "node:test";
import assert from "node:assert/strict";
import { DISPLAY_MS, cardTiming, detectArrivals, queryCutoffMs, visibleOrders } from "./kitchen";

const T0 = Date.UTC(2026, 10, 6, 12, 0, 0);

test("an order is shown from createdAt for exactly five minutes", () => {
  const orders = [{ number: 1, createdMs: T0 }];
  assert.equal(visibleOrders(orders, T0).length, 1);
  assert.equal(visibleOrders(orders, T0 + DISPLAY_MS - 1).length, 1);
  assert.equal(visibleOrders(orders, T0 + DISPLAY_MS).length, 0);
});

test("visibility depends only on createdAt and the clock (survives a reload)", () => {
  const orders = [{ number: 1, createdMs: T0 }];
  // Same inputs after a "refresh": same answer, no local state involved.
  assert.deepEqual(visibleOrders(orders, T0 + 120_000), visibleOrders(orders, T0 + 120_000));
});

test("oldest first, number breaks ties", () => {
  const orders = [
    { number: 3, createdMs: T0 + 2000 },
    { number: 2, createdMs: T0 },
    { number: 1, createdMs: T0 },
  ];
  assert.deepEqual(
    visibleOrders(orders, T0 + 5000).map((o) => o.number),
    [1, 2, 3],
  );
});

test("pending orders without a server time are not shown", () => {
  assert.equal(visibleOrders([{ number: 1, createdMs: null }], T0).length, 0);
});

test("timing: counts up, counts down, flags the last minute", () => {
  const t = cardTiming(T0, T0 + 4 * 60_000 + 5_000);
  assert.deepEqual(t.elapsed, { m: 4, s: 5 });
  assert.deepEqual(t.remaining, { m: 0, s: 55 });
  assert.equal(t.lastMinute, true);
  assert.ok(Math.abs(t.fraction - 55 / 300) < 1e-9);
});

test("timing clamps a createdAt slightly in the future", () => {
  const t = cardTiming(T0 + 800, T0);
  assert.equal(t.elapsedMs, 0);
  assert.equal(t.fraction, 1);
});

test("query cutoff is minute-aligned and at least a minute before the window", () => {
  const now = T0 + 37_000;
  const cutoff = queryCutoffMs(now);
  assert.equal(cutoff % 60_000, 0);
  assert.ok(cutoff <= now - DISPLAY_MS - 60_000 + 59_999);
  assert.ok(cutoff <= now - DISPLAY_MS);
  // Stable within the minute: the listener is not rebuilt every second.
  assert.equal(queryCutoffMs(now + 1000), cutoff);
});

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
  // The same snapshot again (e.g. a re-render or a metadata update): nothing new.
  const third = detectArrivals(second.seen, [{ id: "a", createdMs: T0 }, { id: "b", createdMs: T0 + 5000 }], T0 + 7000);
  assert.deepEqual(third.fresh, []);
});

test("arrivals: an old order entering the query window is not announced", () => {
  const first = detectArrivals(null, [], T0);
  // After the first clock sync the cutoff moves back and a 3-minute-old order appears.
  const r = detectArrivals(first.seen, [{ id: "old", createdMs: T0 - 3 * 60_000 }], T0);
  assert.deepEqual(r.fresh, []);
  assert.ok(r.seen.has("old"), "remembered, so it stays quiet later too");
});

test("arrivals: several orders in one snapshot are all new", () => {
  const first = detectArrivals(null, [], T0);
  const r = detectArrivals(first.seen, [{ id: "x", createdMs: T0 - 1000 }, { id: "y", createdMs: T0 - 500 }], T0);
  assert.deepEqual(r.fresh.map((o) => o.id), ["x", "y"]);
});
