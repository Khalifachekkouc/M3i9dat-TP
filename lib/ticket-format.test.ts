import { test } from "node:test";
import assert from "node:assert/strict";
import { formatOrderNumber, padOrderNumber, ticketFileName } from "./ticket-format";
import { dayKey } from "./i18n";
import { commitOrder, type DocData, type StoreLike } from "./order-core";

test("order number on the tickets: N° and three digits", () => {
  assert.equal(formatOrderNumber(7), "N° 007");
  assert.equal(formatOrderNumber(42), "N° 042");
  assert.equal(formatOrderNumber(999), "N° 999");
  assert.equal(formatOrderNumber(1234), "N° 1234", "never truncated");
  assert.equal(padOrderNumber(1), "001");
});

test("PDF file names", () => {
  assert.equal(ticketFileName("client", 7), "ticket-client-N007.pdf");
  assert.equal(ticketFileName("magasin", 7), "ticket-magasin-N007.pdf");
  assert.equal(ticketFileName("client", 120), "ticket-client-N120.pdf");
  assert.match(ticketFileName("magasin", 3), /^ticket-(client|magasin)-N\d{3,}\.pdf$/);
});

// Morocco is UTC+1, except during Ramadan when it goes back to UTC+0.
test("day rollover follows Africa/Casablanca (UTC+1), not UTC", () => {
  assert.equal(dayKey(new Date("2026-11-06T22:59:59Z")), "2026-11-06", "23:59:59 in Meknes");
  assert.equal(dayKey(new Date("2026-11-06T23:00:00Z")), "2026-11-07", "midnight in Meknes, still the 6th in UTC");
  assert.equal(dayKey(new Date("2026-11-07T00:30:00Z")), "2026-11-07");
});

test("day rollover during Ramadan (Morocco at UTC+0)", () => {
  // Ramadan 2027 runs around 8 Feb to 9 Mar; Morocco's clock is then UTC+0.
  assert.equal(dayKey(new Date("2027-02-20T23:30:00Z")), "2027-02-20", "23:30 local, same day");
  assert.equal(dayKey(new Date("2027-02-21T00:00:00Z")), "2027-02-21", "midnight local");
});

test("year boundary", () => {
  assert.equal(dayKey(new Date("2026-12-31T22:59:00Z")), "2026-12-31");
  assert.equal(dayKey(new Date("2026-12-31T23:00:00Z")), "2027-01-01");
});

test("the counter restarts at 1 on the new shop day", async () => {
  const docs = new Map<string, DocData>();
  const store: StoreLike = {
    runTransaction: async (fn) => {
      const writes = new Map<string, DocData>();
      const r = await fn({
        get: async (p) => docs.get(p) ?? null,
        set: (p, d) => void writes.set(p, d),
      });
      for (const [p, d] of writes) docs.set(p, d);
      return r;
    },
  };
  const item = { productId: "p", name: "Tacos", price: 25, qty: 1, sauces: [] };
  const at = (iso: string, id: string) =>
    commitOrder(store, { orderId: id, day: dayKey(new Date(iso)), items: [item], uid: "u", prepDurationSec: 300 }, "ts");

  const a = await at("2026-11-06T21:00:00Z", "a"); // 22:00 on the 6th
  const b = await at("2026-11-06T22:58:00Z", "b"); // 23:58 on the 6th
  const c = await at("2026-11-06T23:01:00Z", "c"); // 00:01 on the 7th (still the 6th in UTC)
  const d = await at("2026-11-07T08:00:00Z", "d");
  assert.deepEqual([a.number, b.number, c.number, d.number], [1, 2, 1, 2]);
  assert.deepEqual([a.day, c.day], ["2026-11-06", "2026-11-07"]);
});
