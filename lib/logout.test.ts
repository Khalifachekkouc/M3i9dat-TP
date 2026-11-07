import { test } from "node:test";
import assert from "node:assert/strict";
import { cashierLogoutWarning } from "./logout";

test("logout warning: nothing in progress, no warning", () => {
  assert.equal(cashierLogoutWarning(0, false), null);
});

test("logout warning: a cart in progress is announced with its item count", () => {
  assert.match(cashierLogoutWarning(1, false)!, /1 article\)/);
  assert.match(cashierLogoutWarning(3, false)!, /3 articles\)/);
});

test("logout warning: an unconfirmed validation wins over the plain cart message", () => {
  const message = cashierLogoutWarning(2, true)!;
  assert.match(message, /pas été confirmée/);
  assert.doesNotMatch(message, /articles?\)/);
});

test("logout warning: a pending order id alone (cart already emptied elsewhere) still warns", () => {
  assert.notEqual(cashierLogoutWarning(0, true), null);
});
