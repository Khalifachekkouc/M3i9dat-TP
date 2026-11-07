/**
 * settings/kitchen = { prepDurationSec }: how long an order stays « En préparation »
 * before it completes on its own. Each order keeps a copy taken when it was
 * created (orders.prepDurationSec), so a change only affects new orders.
 * The same bounds are enforced in firestore.rules.
 */
export const DEFAULT_PREP_SEC = 300;
export const MIN_PREP_SEC = 30;
export const MAX_PREP_SEC = 3600;

export const isValidPrepDuration = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= MIN_PREP_SEC && value <= MAX_PREP_SEC;

/** The stored setting, or the default when it is missing or out of bounds. */
export const prepDurationOrDefault = (value: unknown): number => (isValidPrepDuration(value) ? value : DEFAULT_PREP_SEC);

export type PrepInputResult = { ok: true; seconds: number } | { ok: false; reason: "format" | "tooShort" | "tooLong" };

/** The admin form: minutes and seconds as typed ("" counts as 0). */
export function parsePrepInput(minutes: string, seconds: string): PrepInputResult {
  const read = (s: string) => (s.trim() === "" ? 0 : /^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
  const m = read(minutes);
  const sec = read(seconds);
  if (Number.isNaN(m) || Number.isNaN(sec) || sec > 59) return { ok: false, reason: "format" };
  const total = m * 60 + sec;
  if (total < MIN_PREP_SEC) return { ok: false, reason: "tooShort" };
  if (total > MAX_PREP_SEC) return { ok: false, reason: "tooLong" };
  return { ok: true, seconds: total };
}

/** 300 -> { minutes: 5, seconds: 0 } */
export const splitPrepDuration = (total: number) => ({ minutes: Math.floor(total / 60), seconds: total % 60 });
