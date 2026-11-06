import { fr, type Messages } from "./fr";

export type Locale = "fr";

const messages: Record<Locale, Messages> = { fr };

/** Active locale. When Arabic is added, read it from a setting and switch `dir` to "rtl". */
export const locale: Locale = "fr";
export const dir: "ltr" | "rtl" = "ltr";
export const t: Messages = messages[locale];

/** Shop time zone: dates, "today" and the daily order counter all follow it. */
export const SHOP_TIME_ZONE = "Africa/Casablanca";

const intlLocale = "fr-MA";

const madWhole = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "MAD", maximumFractionDigits: 0 });
const madCents = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "MAD", minimumFractionDigits: 2 });

/** 25 -> "25 MAD", 12.5 -> "12,50 MAD" */
export function formatMAD(amount: number): string {
  return Number.isInteger(amount) ? madWhole.format(amount) : madCents.format(amount);
}

const timeFmt = new Intl.DateTimeFormat(intlLocale, { timeZone: SHOP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat(intlLocale, {
  timeZone: SHOP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const longDayFmt = new Intl.DateTimeFormat(intlLocale, {
  timeZone: SHOP_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const formatTime = (d: Date) => timeFmt.format(d);
export const formatDateTime = (d: Date) => dateTimeFmt.format(d);

/** "2026-11-06" -> "vendredi 6 novembre 2026" (noon UTC avoids any day shift). */
export const formatDayKey = (day: string) => longDayFmt.format(new Date(`${day}T12:00:00Z`));

/** The shop's calendar day for a moment, as YYYY-MM-DD in Africa/Casablanca. */
export const dayKey = (d: Date) => dayKeyFmt.format(d);

/** Move a YYYY-MM-DD key by whole days. */
export function shiftDayKey(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
