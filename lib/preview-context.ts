"use client";

import { createContext } from "react";
import type { Order, Product } from "./types";

/**
 * Development-only: lets /preview/* render the real screens from fixture data
 * instead of Firestore, so they can be looked at and linted without accounts.
 * Production builds return 404 for /preview (see app/preview/layout.tsx).
 */
export interface PreviewData {
  products: Product[];
  sauces: string[];
  orders: Order[];
}

export const PreviewContext = createContext<PreviewData | null>(null);
