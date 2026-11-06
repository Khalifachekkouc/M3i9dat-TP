import { test } from "node:test";
import assert from "node:assert/strict";
import { cartReducer, needsSauce, toOrderItems, type CartLine } from "./cart";
import type { Product } from "./types";

const product = (id: string, sauceOptions: string[] = ["Tomate", "Piquante"]): Product => ({
  id,
  name: id,
  price: 25,
  category: "Tacos",
  imageUrl: "",
  available: true,
  sauceOptions,
  order: 0,
  createdAt: null,
});

const SAUCES = ["Tomate", "Piquante"];
const add = (lines: CartLine[], p: Product, choices = p.sauceOptions) =>
  cartReducer(lines, { type: "add", product: p, sauceChoices: choices });

test("a product with sauces starts waiting for a sauce choice", () => {
  const lines = add([], product("tacos"));
  assert.equal(lines.length, 1);
  assert.equal(needsSauce(lines[0]), true);
});

test("a product without sauce options never waits", () => {
  const lines = add([], product("coca", []));
  assert.equal(needsSauce(lines[0]), false);
  assert.deepEqual(toOrderItems(lines)[0].sauces, []);
});

test("tapping the same pending product again raises its quantity", () => {
  let lines = add([], product("tacos"));
  lines = add(lines, product("tacos"));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 2);
});

test("once a sauce is chosen, the next tap starts a new line (different sauces allowed)", () => {
  let lines = add([], product("tacos"));
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Tomate" });
  lines = add(lines, product("tacos"));
  assert.equal(lines.length, 2);
  assert.equal(needsSauce(lines[1]), true);
});

test("both sauces keep the shop order whatever the tap order", () => {
  let lines = add([], product("tacos"));
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Piquante" });
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Tomate" });
  assert.deepEqual(lines[0].sauces, SAUCES);
  assert.equal(needsSauce(lines[0]), false);
});

test("unticking the last sauce puts the line back to waiting", () => {
  let lines = add([], product("tacos"));
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Tomate" });
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Tomate" });
  assert.equal(needsSauce(lines[0]), true);
});

test("'Sans sauce' is an explicit choice and clears sauces", () => {
  let lines = add([], product("tacos"));
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Tomate" });
  lines = cartReducer(lines, { type: "noSauce", key: lines[0].key });
  assert.equal(needsSauce(lines[0]), false);
  assert.deepEqual(lines[0].sauces, []);
});

test("sauce-less products merge into one line", () => {
  let lines = add([], product("coca", []));
  lines = add(lines, product("tacos"));
  lines = add(lines, product("coca", []));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].qty, 2);
});

test("decrementing the last unit removes the line", () => {
  let lines = add([], product("coca", []));
  lines = cartReducer(lines, { type: "dec", key: lines[0].key });
  assert.equal(lines.length, 0);
});

test("order items drop empty notes and trim the rest", () => {
  let lines = add([], product("tacos"));
  lines = add(lines, product("coca", []));
  lines = cartReducer(lines, { type: "note", key: lines[0].key, note: "  sans oignon  " });
  const items = toOrderItems(lines);
  assert.equal(items[0].note, "sans oignon");
  assert.equal("note" in items[1], false);
});
