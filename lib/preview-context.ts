"use client";

import { createContext } from "react";
import type { PlacedOrder } from "./orders";
import type { Order, OrderItem, Product } from "./types";

/**
 * Development-only: lets /preview/* render the real screens from fixture data
 * instead of Firestore, so they can be looked at and linted without accounts.
 * Production builds return 404 for /preview (see app/preview/layout.tsx).
 */
export interface PreviewData {
  products: Product[];
  sauces: string[];
  orders: Order[];
  /** Replaces the Firestore save on /preview/cashier, so validating works offline. */
  placeOrder?: (orderId: string, items: OrderItem[], uid: string) => Promise<PlacedOrder>;
}

export const PreviewContext = createContext<PreviewData | null>(null);
