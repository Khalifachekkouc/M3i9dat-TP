import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREP_SEC,
  isValidPrepDuration,
  parsePrepInput,
  prepDurationOrDefault,
  splitPrepDuration,
} from "./kitchen-settings";

test("settings: valid durations are whole seconds from 30 to 3600", () => {
  for (const ok of [30, 300, 3600]) assert.equal(isValidPrepDuration(ok), true, String(ok));
  for (const bad of [29, 3601, 0, -5, 90.5, "300", null, undefined, Number.NaN]) {
    assert.equal(isValidPrepDuration(bad), false, String(bad));
  }
});

test("settings: missing or invalid stored value falls back to 300 s", () => {
  assert.equal(DEFAULT_PREP_SEC, 300);
  assert.equal(prepDurationOrDefault(undefined), 300);
  assert.equal(prepDurationOrDefault(10), 300);
  assert.equal(prepDurationOrDefault(120), 120);
});

test("admin form: minutes and seconds", () => {
  assert.deepEqual(parsePrepInput("5", ""), { ok: true, seconds: 300 });
  assert.deepEqual(parsePrepInput("1", "30"), { ok: true, seconds: 90 });
  assert.deepEqual(parsePrepInput("", "30"), { ok: true, seconds: 30 });
  assert.deepEqual(parsePrepInput("60", "0"), { ok: true, seconds: 3600 });
  assert.deepEqual(parsePrepInput("0", "29"), { ok: false, reason: "tooShort" });
  assert.deepEqual(parsePrepInput("60", "1"), { ok: false, reason: "tooLong" });
  assert.deepEqual(parsePrepInput("2,5", "0"), { ok: false, reason: "format" });
  assert.deepEqual(parsePrepInput("2", "75"), { ok: false, reason: "format" });
  assert.deepEqual(parsePrepInput("-1", "0"), { ok: false, reason: "format" });
});

test("admin form: round trip", () => {
  assert.deepEqual(splitPrepDuration(90), { minutes: 1, seconds: 30 });
  assert.deepEqual(splitPrepDuration(3600), { minutes: 60, seconds: 0 });
});
