import { t } from "./i18n";

/**
 * What the cashier is told before logging out, or null when there is nothing
 * to lose. Logging out never deletes the cart or the pending order id (both
 * stay in this device's localStorage); the warning says so, so a cart in
 * progress is never left behind without the cashier knowing.
 */
export function cashierLogoutWarning(itemCount: number, hasPendingOrder: boolean): string | null {
  if (hasPendingOrder) return t.logout.pendingKept;
  if (itemCount > 0) return t.logout.cartKept(itemCount);
  return null;
}
