import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commitOrder,
  clearPendingOrderId,
  pendingOrderId,
  readPendingOrderId,
  sameItems,
  type DocData,
  type KeyValueStore,
  type StoreLike,
} from "./order-core";
import type { OrderItem } from "./types";

/**
 * In-memory stand-in for Firestore. Writes are buffered and applied at commit,
 * like a real transaction. `failNext` simulates the network dropping:
 *   "before-commit": nothing reaches the server, the client gets an error;
 *   "after-commit":  the server saved everything, but the answer is lost.
 */
class FakeStore implements StoreLike {
  docs = new Map<string, DocData>();
  failNext: "before-commit" | "after-commit" | null = null;

  async runTransaction<T>(fn: (tx: { get(p: string): Promise<DocData | null>; set(p: string, d: DocData): void }) => Promise<T>) {
    const writes = new Map<string, DocData>();
    const result = await fn({
      get: async (p) => (this.docs.has(p) ? structuredClone(this.docs.get(p)!) : null),
      set: (p, d) => void writes.set(p, structuredClone(d)),
    });
    const failure = this.failNext;
    this.failNext = null;
    if (failure === "before-commit") throw Object.assign(new Error("unavailable"), { code: "unavailable" });
    for (const [p, d] of writes) this.docs.set(p, d);
    if (failure === "after-commit") throw Object.assign(new Error("deadline exceeded"), { code: "deadline-exceeded" });
    return result;
  }

  orders = () => [...this.docs.entries()].filter(([p]) => p.startsWith("orders/"));
}

class MemoryStorage implements KeyValueStore {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

const DAY = "2026-11-06";
const TS = "<serverTimestamp>";
const tacos: OrderItem = { productId: "p1", name: "Tacos", price: 25, qty: 2, sauces: ["Tomate"] };
const coca: OrderItem = { productId: "p2", name: "Coca", price: 7, qty: 1, sauces: [] };

let ids = 0;
const createId = () => `id${String(++ids).padStart(18, "0")}`;

/** What the cashier screen does on "Valider": reuse or create the pending id, save, clear on success. */
async function validate(store: FakeStore, storage: KeyValueStore, items: OrderItem[], prepDurationSec = 300) {
  const orderId = pendingOrderId(storage, createId);
  const result = await commitOrder(store, { orderId, day: DAY, items, uid: "cashier", prepDurationSec }, TS);
  clearPendingOrderId(storage);
  return result;
}

test("retry after a failure that never reached the server: one order, number 1", async () => {
  const store = new FakeStore();
  const storage = new MemoryStorage();

  store.failNext = "before-commit";
  await assert.rejects(validate(store, storage, [tacos]));
  const kept = readPendingOrderId(storage);
  assert.ok(kept, "the pending id survives the failure");
  assert.equal(store.orders().length, 0);

  const result = await validate(store, storage, [tacos]);
  assert.equal(result.status, "created");
  assert.equal(result.orderId, kept, "the retry reuses the same document id");
  assert.equal(result.number, 1);
  assert.equal(store.orders().length, 1);
  assert.deepEqual(store.docs.get(`counters/${DAY}`), { value: 1, lastOrderId: kept });
  assert.equal(readPendingOrderId(storage), null, "cleared after the confirmed save");
});

test("retry after a save whose confirmation was lost: returns the same order, no copy", async () => {
  const store = new FakeStore();
  const storage = new MemoryStorage();

  store.failNext = "after-commit";
  await assert.rejects(validate(store, storage, [tacos, coca]));
  assert.equal(store.orders().length, 1, "the server did save it");
  assert.ok(readPendingOrderId(storage), "the client did not hear back, so the id is still pending");

  const result = await validate(store, storage, [tacos, coca]);
  assert.equal(result.status, "existing");
  assert.equal(result.number, 1, "same number as the saved order");
  assert.equal(store.orders().length, 1, "still exactly one order");
  assert.equal((store.docs.get(`counters/${DAY}`) as { value: number }).value, 1, "the counter did not move");
  assert.equal(sameItems(result.items, [tacos, coca]), true);
});

test("an edited cart after a lost confirmation is reported as different", async () => {
  const store = new FakeStore();
  const storage = new MemoryStorage();
  store.failNext = "after-commit";
  await assert.rejects(validate(store, storage, [tacos]));
  const result = await validate(store, storage, [tacos, coca]);
  assert.equal(result.status, "existing");
  assert.equal(sameItems(result.items, [tacos, coca]), false);
});

test("two different orders get two documents and numbers 1 and 2", async () => {
  const store = new FakeStore();
  const storage = new MemoryStorage();

  const first = await validate(store, storage, [tacos]);
  const second = await validate(store, storage, [coca]);
  assert.notEqual(first.orderId, second.orderId);
  assert.deepEqual([first.number, second.number], [1, 2]);
  assert.equal(store.orders().length, 2);
  assert.deepEqual(store.docs.get(`counters/${DAY}`), { value: 2, lastOrderId: second.orderId });
});

test("starting a new cart drops the pending id", () => {
  const storage = new MemoryStorage();
  const id = pendingOrderId(storage, createId);
  assert.equal(pendingOrderId(storage, createId), id, "same id until cleared");
  clearPendingOrderId(storage);
  assert.notEqual(pendingOrderId(storage, createId), id);
});

test("saved items drop empty notes and keep only model fields", async () => {
  const store = new FakeStore();
  const messy = { ...tacos, note: "  ", extra: "x" } as OrderItem;
  const result = await commitOrder(store, { orderId: createId(), day: DAY, items: [messy], uid: "u", prepDurationSec: 300 }, TS);
  const saved = store.docs.get(`orders/${result.orderId}`) as { items: DocData[]; total: number; createdAt: string };
  assert.deepEqual(Object.keys(saved.items[0]).sort(), ["name", "price", "productId", "qty", "sauces"]);
  assert.equal(saved.total, 50);
  assert.equal(saved.createdAt, TS);
});

test("new orders start « preparing » with a copy of the prep duration", async () => {
  const store = new FakeStore();
  const storage = new MemoryStorage();
  const first = await validate(store, storage, [tacos], 300);
  // The admin changes the setting to 2 minutes: only the next order gets it.
  const second = await validate(store, storage, [coca], 120);
  const a = store.docs.get(`orders/${first.orderId}`) as { status: string; prepDurationSec: number };
  const b = store.docs.get(`orders/${second.orderId}`) as { status: string; prepDurationSec: number };
  assert.equal(a.status, "preparing");
  assert.equal(a.prepDurationSec, 300, "the first order keeps the duration it was made with");
  assert.equal(b.prepDurationSec, 120);
  assert.ok(!("completedAt" in a) && !("completedBy" in a), "no completion fields at creation");
});

test("an invalid prep duration is refused before anything is written", async () => {
  const store = new FakeStore();
  for (const bad of [10, 3601, 90.5]) {
    await assert.rejects(commitOrder(store, { orderId: createId(), day: DAY, items: [tacos], uid: "u", prepDurationSec: bad }, TS));
  }
  assert.equal(store.docs.size, 0);
});
