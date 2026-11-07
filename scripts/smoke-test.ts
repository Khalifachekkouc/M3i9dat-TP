/**
 * Smoke test of the deployed security rules, against the LIVE project.
 * Signs in as each role with the client SDK (the same path the app uses) and
 * checks what is allowed and what is denied. Cleans up after itself.
 *
 * Credentials come from the environment only (never stored in a file):
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD
 *   SMOKE_CASHIER_EMAIL / SMOKE_CASHIER_PASSWORD
 *   SMOKE_KITCHEN_EMAIL / SMOKE_KITCHEN_PASSWORD
 * plus GOOGLE_APPLICATION_CREDENTIALS (via .env.local) for setup and cleanup:
 * a temporary account without a role, deleting the test orders, and resetting
 * today's order counter if the test was the first to create it.
 *
 *   npm run smoke-test
 */
import { randomBytes } from "node:crypto";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { adminAuth, adminDb } from "./admin-sdk";
import { commitOrder, type StoreLike } from "../lib/order-core";
import { isValidPrepDuration, prepDurationOrDefault } from "../lib/kitchen-settings";
import { dayKey } from "../lib/i18n";
import type { OrderItem } from "../lib/types";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing environment variable ${name}.`);
    process.exit(2);
  }
  return v;
}

const creds = {
  admin: { email: need("SMOKE_ADMIN_EMAIL"), password: need("SMOKE_ADMIN_PASSWORD") },
  cashier: { email: need("SMOKE_CASHIER_EMAIL"), password: need("SMOKE_CASHIER_PASSWORD") },
  kitchen: { email: need("SMOKE_KITCHEN_EMAIL"), password: need("SMOKE_KITCHEN_PASSWORD") },
};

// ---------------------------------------------------------------------------

type Outcome = "allowed" | "denied";
const results: { who: string; what: string; expected: Outcome; got: string; ok: boolean }[] = [];

async function expect(who: string, what: string, expected: Outcome, action: () => Promise<unknown>) {
  let got: string;
  try {
    await action();
    got = "allowed";
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    got = code === "permission-denied" ? "denied" : `error: ${code || (error as Error).message}`;
  }
  const ok = got === expected;
  results.push({ who, what, expected, got, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${who.padEnd(10)} ${what.padEnd(58)} expected ${expected}, got ${got}`);
}

function check(who: string, what: string, ok: boolean, detail = "") {
  results.push({ who, what, expected: "allowed", got: ok ? "allowed" : `wrong ${detail}`, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${who.padEnd(10)} ${what}${detail ? `  (${detail})` : ""}`);
}

const apps: FirebaseApp[] = [];
async function session(name: string, email?: string, password?: string) {
  const app = initializeApp(config, `smoke-${name}-${Date.now()}`);
  apps.push(app);
  const db = getFirestore(app);
  const auth = getAuth(app);
  if (email && password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { db, auth, uid: cred.user.uid };
  }
  return { db, auth, uid: "" };
}

const storeFor = (db: Firestore): StoreLike => ({
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
});

const newId = (db: Firestore) => doc(collection(db, "orders")).id;

// ---------------------------------------------------------------------------

async function main() {
  const createdOrders: string[] = [];
  const touchedDays = new Set<string>();
  const counterBefore = new Map<string, number | null>();
  let tempUid: string | null = null;
  let kitchenSettingsBefore: FirebaseFirestore.DocumentData | undefined;

  const noteDay = async (day: string) => {
    if (counterBefore.has(day)) return;
    const snap = await adminDb.doc(`counters/${day}`).get();
    counterBefore.set(day, snap.exists ? Number(snap.get("value")) : null);
  };

  try {
    // ---- Data check (Admin SDK reads, independent of the import script) ----
    const products = await adminDb.collection("products").get();
    const categories = new Set(products.docs.map((d) => String(d.get("category"))));
    check("data", `products: ${products.size} in ${categories.size} categories`, products.size === 21 && categories.size === 5);
    const sauces = (await adminDb.doc("settings/sauces").get()).get("list");
    check("data", `settings/sauces = ${JSON.stringify(sauces)}`, JSON.stringify(sauces) === '["Tomate","Piquante"]');
    kitchenSettingsBefore = (await adminDb.doc("settings/kitchen").get()).data();
    check(
      "data",
      `settings/kitchen = ${JSON.stringify(kitchenSettingsBefore ?? null)}`,
      isValidPrepDuration(kitchenSettingsBefore?.prepDurationSec),
    );
    const prep = prepDurationOrDefault(kitchenSettingsBefore?.prepDurationSec);
    const sample = products.docs[0];
    const productId = sample.id;
    const productAvailable = sample.get("available") === true;
    const item: OrderItem = {
      productId,
      name: String(sample.get("name")),
      price: Number(sample.get("price")),
      qty: 1,
      sauces: ["Tomate"],
    };

    // ---- Unauthenticated ----
    const anon = await session("anon");
    await expect("anonymous", "read products", "denied", () => getDocs(collection(anon.db, "products")));
    await expect("anonymous", "read settings/sauces", "denied", () => getDoc(doc(anon.db, "settings/sauces")));
    await expect("anonymous", "read orders", "denied", () => getDocs(collection(anon.db, "orders")));
    await expect("anonymous", "read settings/kitchen", "denied", () => getDoc(doc(anon.db, "settings/kitchen")));
    await expect("anonymous", "create an order", "denied", () =>
      setDoc(doc(anon.db, "orders", newId(anon.db)), { number: 1 }),
    );

    // ---- Signed in, but no role ----
    const tempEmail = `smoke-norole-${randomBytes(4).toString("hex")}@example.com`;
    const tempPassword = randomBytes(18).toString("base64url");
    tempUid = (await adminAuth.createUser({ email: tempEmail, password: tempPassword })).uid;
    const norole = await session("norole", tempEmail, tempPassword);
    await expect("no role", "read products", "denied", () => getDocs(collection(norole.db, "products")));
    await expect("no role", "read settings/sauces", "denied", () => getDoc(doc(norole.db, "settings/sauces")));
    await expect("no role", "read orders", "denied", () => getDocs(collection(norole.db, "orders")));
    await expect("no role", "read settings/kitchen", "denied", () => getDoc(doc(norole.db, "settings/kitchen")));
    await expect("no role", "give itself the admin role", "denied", () =>
      setDoc(doc(norole.db, "users", norole.uid), { role: "admin" }),
    );
    await expect("no role", "create an order", "denied", () =>
      commitOrder(storeFor(norole.db), { orderId: newId(norole.db), day: dayKey(new Date()), items: [item], uid: norole.uid, prepDurationSec: prep }, serverTimestamp()),
    );

    // ---- Cashier ----
    const cashier = await session("cashier", creds.cashier.email, creds.cashier.password);
    await expect("cashier", "read products", "allowed", () => getDocs(collection(cashier.db, "products")));
    await expect("cashier", "read settings/sauces", "allowed", () => getDoc(doc(cashier.db, "settings/sauces")));
    await expect("cashier", "read settings/kitchen (prep duration)", "allowed", () => getDoc(doc(cashier.db, "settings/kitchen")));
    await expect("cashier", "change the prep duration", "denied", () => setDoc(doc(cashier.db, "settings/kitchen"), { prepDurationSec: 60 }));

    const day = dayKey(new Date());
    await noteDay(day);
    const before = counterBefore.get(day) ?? 0;
    const placed: { id: string; number: number }[] = [];
    for (const n of [1, 2]) {
      const orderId = newId(cashier.db);
      await expect("cashier", `create order ${n}`, "allowed", async () => {
        const r = await commitOrder(storeFor(cashier.db), { orderId, day, items: [item], uid: cashier.uid, prepDurationSec: prep }, serverTimestamp());
        placed.push({ id: orderId, number: r.number });
        createdOrders.push(orderId);
        touchedDays.add(r.day);
      });
    }
    check(
      "cashier",
      `daily numbers increment: ${placed.map((p) => p.number).join(", ")} after counter ${before || "absent"}`,
      placed.length === 2 && placed[0].number === before + 1 && placed[1].number === before + 2,
    );

    // Retry with the same id (confirmation lost): same order back, nothing written.
    if (placed[1]) {
      const r = await commitOrder(storeFor(cashier.db), { orderId: placed[1].id, day, items: [item], uid: cashier.uid, prepDurationSec: prep }, serverTimestamp());
      const counter = (await adminDb.doc(`counters/${day}`).get()).get("value");
      check("cashier", "retry with the same order id returns the saved order", r.status === "existing" && r.number === placed[1].number && counter === before + 2, `status ${r.status}, counter ${counter}`);
    }

    await expect("cashier", "edit a product", "denied", () => updateDoc(doc(cashier.db, "products", productId), { available: !productAvailable }));
    await expect("cashier", "create a product", "denied", () =>
      setDoc(doc(cashier.db, "products", "smoke-forbidden"), { name: "x", price: 1, category: "x", imageUrl: "", available: true, sauceOptions: [], order: 1, createdAt: serverTimestamp() }),
    );
    await expect("cashier", "delete a product", "denied", () => deleteDoc(doc(cashier.db, "products", productId)));
    await expect("cashier", "edit the sauce list", "denied", () => setDoc(doc(cashier.db, "settings/sauces"), { list: ["x"] }));
    if (placed[0]) {
      await expect("cashier", "edit an order", "denied", () => updateDoc(doc(cashier.db, "orders", placed[0].id), { total: 0 }));
      await expect("cashier", "delete an order", "denied", () => deleteDoc(doc(cashier.db, "orders", placed[0].id)));
    }
    await expect("cashier", "bump the counter without an order (gap)", "denied", () =>
      setDoc(doc(cashier.db, "counters", day), { value: before + 3, lastOrderId: newId(cashier.db) }),
    );
    const rawOrder = (number: number, extra: Record<string, unknown>) => async () => {
      const orderId = newId(cashier.db);
      await runTransaction(cashier.db, async (tx) => {
        tx.set(doc(cashier.db, "counters", day), { value: number, lastOrderId: orderId });
        tx.set(doc(cashier.db, "orders", orderId), {
          number, day, items: [item], total: item.price, createdAt: serverTimestamp(), createdBy: cashier.uid,
          status: "preparing", prepDurationSec: prep, ...extra,
        });
      });
      createdOrders.push(orderId);
    };
    await expect("cashier", "create an order with a skipped number", "denied", rawOrder(before + 5, {}));
    await expect("cashier", "create an order with a 10 s prep duration", "denied", rawOrder(before + 3, { prepDurationSec: 10 }));
    await expect("cashier", "create an order with a 3601 s prep duration", "denied", rawOrder(before + 3, { prepDurationSec: 3601 }));
    await expect("cashier", "create an order already « completed »", "denied", rawOrder(before + 3, { status: "completed" }));
    await expect("cashier", "create an order without a status", "denied", rawOrder(before + 3, { status: null }));
    if (placed[0]) {
      await expect("cashier", "mark an order « Terminé »", "denied", () =>
        updateDoc(doc(cashier.db, "orders", placed[0].id), { status: "completed", completedAt: serverTimestamp(), completedBy: "kitchen" }),
      );
    }
    await expect("cashier", "give itself the admin role", "denied", () => setDoc(doc(cashier.db, "users", cashier.uid), { role: "admin" }));
    await expect("cashier", "read the user list", "denied", () => getDocs(collection(cashier.db, "users")));

    // ---- Kitchen ----
    const kitchen = await session("kitchen", creds.kitchen.email, creds.kitchen.password);
    await expect("kitchen", "read orders", "allowed", async () => {
      const snap = await getDocs(collection(kitchen.db, "orders"));
      if (!createdOrders.every((id) => snap.docs.some((d) => d.id === id))) throw new Error("test orders not visible");
    });
    await expect("kitchen", "create an order", "denied", () =>
      commitOrder(storeFor(kitchen.db), { orderId: newId(kitchen.db), day, items: [item], uid: kitchen.uid, prepDurationSec: prep }, serverTimestamp()),
    );
    await expect("kitchen", "edit a product", "denied", () => updateDoc(doc(kitchen.db, "products", productId), { available: !productAvailable }));
    await expect("kitchen", "read settings/kitchen", "allowed", () => getDoc(doc(kitchen.db, "settings/kitchen")));
    await expect("kitchen", "change the prep duration", "denied", () => setDoc(doc(kitchen.db, "settings/kitchen"), { prepDurationSec: 60 }));
    const finish = { status: "completed", completedAt: serverTimestamp(), completedBy: "kitchen" };
    if (placed[1]) {
      const ref = doc(kitchen.db, "orders", placed[1].id);
      await expect("kitchen", "complete + change the items", "denied", () => updateDoc(ref, { ...finish, items: [] }));
      await expect("kitchen", "complete + change the total", "denied", () => updateDoc(ref, { ...finish, total: 0 }));
      await expect("kitchen", "change the order's prep duration", "denied", () => updateDoc(ref, { prepDurationSec: 3600 }));
      await expect("kitchen", "change the number", "denied", () => updateDoc(ref, { number: 999 }));
      await expect("kitchen", "complete with completedBy 'auto'", "denied", () => updateDoc(ref, { ...finish, completedBy: "auto" }));
      await expect("kitchen", "complete with its own clock (not server time)", "denied", () =>
        updateDoc(ref, { ...finish, completedAt: Timestamp.now() }),
      );
    }
    if (placed[0]) {
      const ref = doc(kitchen.db, "orders", placed[0].id);
      await expect("kitchen", "« Terminé » (status, completedAt, completedBy)", "allowed", () => updateDoc(ref, finish));
      const after = (await adminDb.doc(`orders/${placed[0].id}`).get()).data()!;
      check(
        "kitchen",
        "the completed order kept its items, number, total and duration",
        after.status === "completed" && after.completedBy === "kitchen" && after.completedAt && after.number === placed[0].number &&
          Array.isArray(after.items) && after.items.length === 1 && after.total === item.price && after.prepDurationSec === prep,
        `status ${after.status}, by ${after.completedBy}`,
      );
      await expect("kitchen", "« Terminé » again on a completed order", "denied", () => updateDoc(ref, finish));
    }
    if (placed[0]) await expect("kitchen", "delete an order", "denied", () => deleteDoc(doc(kitchen.db, "orders", placed[0].id)));
    await expect("kitchen", "write its clock probe (server time)", "allowed", () => setDoc(doc(kitchen.db, "clock", kitchen.uid), { t: serverTimestamp() }));

    // ---- Admin ----
    const admin = await session("admin", creds.admin.email, creds.admin.password);
    await expect("admin", "edit a product (toggle, then restore)", "allowed", async () => {
      await updateDoc(doc(admin.db, "products", productId), { available: !productAvailable });
      await updateDoc(doc(admin.db, "products", productId), { available: productAvailable });
    });
    await expect("admin", "save the sauce list (unchanged)", "allowed", () => setDoc(doc(admin.db, "settings/sauces"), { list: ["Tomate", "Piquante"] }));
    await expect("admin", "read the user list", "allowed", () => getDocs(collection(admin.db, "users")));
    const kitchenRef = doc(admin.db, "settings/kitchen");
    await expect("admin", "set the prep duration to 120 s", "allowed", () => setDoc(kitchenRef, { prepDurationSec: 120 }));
    await expect("admin", "set it to 10 s (under 30)", "denied", () => setDoc(kitchenRef, { prepDurationSec: 10 }));
    await expect("admin", "set it to 3601 s (over 60 min)", "denied", () => setDoc(kitchenRef, { prepDurationSec: 3601 }));
    await expect("admin", "set it to 90.5 s (not whole)", "denied", () => setDoc(kitchenRef, { prepDurationSec: 90.5 }));
    await expect("admin", "set it to \"300\" (a string)", "denied", () => setDoc(kitchenRef, { prepDurationSec: "300" }));
    await expect("admin", "add an unknown field", "denied", () => setDoc(kitchenRef, { prepDurationSec: 300, x: 1 }));
    // Snapshot: a new order made now gets 120 s; the older ones keep theirs.
    {
      const nowPrep = prepDurationOrDefault((await getDoc(doc(cashier.db, "settings/kitchen"))).get("prepDurationSec"));
      const orderId = newId(cashier.db);
      await expect("cashier", `create an order after the change (reads ${nowPrep} s)`, "allowed", async () => {
        const r = await commitOrder(storeFor(cashier.db), { orderId, day, items: [item], uid: cashier.uid, prepDurationSec: nowPrep }, serverTimestamp());
        createdOrders.push(orderId);
        touchedDays.add(r.day);
      });
      const newer = (await adminDb.doc(`orders/${orderId}`).get()).get("prepDurationSec");
      const older = placed[1] ? (await adminDb.doc(`orders/${placed[1].id}`).get()).get("prepDurationSec") : null;
      check("cashier", `duration snapshot: new order ${newer} s, earlier order still ${older} s`, newer === 120 && older === prep);
    }
    await expect("admin", "create an order", "allowed", async () => {
      const orderId = newId(admin.db);
      const r = await commitOrder(storeFor(admin.db), { orderId, day, items: [item], uid: admin.uid, prepDurationSec: prep }, serverTimestamp());
      createdOrders.push(orderId);
      touchedDays.add(r.day);
      check("admin", `its order takes the next number (${r.number})`, r.number === before + 4);
    });
    if (placed[0]) await expect("admin", "edit an order", "allowed", () => updateDoc(doc(admin.db, "orders", placed[0].id), { total: placed[0].number }));
    await expect("admin", "delete the test orders", "allowed", async () => {
      for (const id of createdOrders) await deleteDoc(doc(admin.db, "orders", id));
    });
    for (const s of [anon, norole, cashier, kitchen, admin]) await signOut(s.auth).catch(() => undefined);
  } finally {
    // ---- Cleanup (Admin SDK) ----
    if (kitchenSettingsBefore) await adminDb.doc("settings/kitchen").set(kitchenSettingsBefore);
    else await adminDb.doc("settings/kitchen").delete().catch(() => undefined);
    for (const id of createdOrders) await adminDb.doc(`orders/${id}`).delete().catch(() => undefined);
    for (const day of touchedDays) {
      await noteDay(day);
      const was = counterBefore.get(day);
      if (was === null || was === undefined) await adminDb.doc(`counters/${day}`).delete();
      else await adminDb.doc(`counters/${day}`).set({ value: was }, { merge: true });
    }
    if (tempUid) {
      await adminAuth.deleteUser(tempUid).catch(() => undefined);
      await adminDb.doc(`users/${tempUid}`).delete().catch(() => undefined);
    }
    const left = await Promise.all(createdOrders.map((id) => adminDb.doc(`orders/${id}`).get()));
    console.log(
      `\nCleanup: ${createdOrders.length} test orders deleted (${left.filter((d) => d.exists).length} left), ` +
        `counters reset for ${[...touchedDays].join(", ") || "no day"}, temporary no-role account ${tempUid ? "deleted" : "not created"}, ` +
        `settings/kitchen restored to ${JSON.stringify(kitchenSettingsBefore ?? null)}.`,
    );
    for (const app of apps) await deleteApp(app).catch(() => undefined);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("Smoke test crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
