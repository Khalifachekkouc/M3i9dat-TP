"use client";

import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { PreviewContext } from "./preview-context";
import { DEFAULT_PREP_SEC, prepDurationOrDefault } from "./kitchen-settings";
import { DEFAULT_SAUCES, type Order, type OrderItem, type Product } from "./types";

export type Live<T> =
  | { status: "loading" }
  | { status: "error"; error: FirestoreError }
  | { status: "ready"; data: T; fromCache: boolean };

export function toProduct(snap: QueryDocumentSnapshot): Product {
  const d = snap.data();
  return {
    id: snap.id,
    name: String(d.name ?? ""),
    price: Number(d.price ?? 0),
    category: String(d.category ?? ""),
    imageUrl: String(d.imageUrl ?? ""),
    imagePath: d.imagePath ? String(d.imagePath) : undefined,
    available: d.available !== false,
    sauceOptions: Array.isArray(d.sauceOptions) ? d.sauceOptions.map(String) : [],
    order: Number(d.order ?? 0),
    createdAt: d.createdAt ?? null,
  };
}

export function toOrder(snap: QueryDocumentSnapshot): Order {
  // serverTimestamps: "estimate" so a pending local write still has a time.
  const d = snap.data({ serverTimestamps: "estimate" });
  return {
    id: snap.id,
    number: Number(d.number ?? 0),
    day: String(d.day ?? ""),
    items: Array.isArray(d.items) ? (d.items as OrderItem[]) : [],
    total: Number(d.total ?? 0),
    createdAt: d.createdAt ?? null,
    createdBy: String(d.createdBy ?? ""),
    status: d.status === "completed" ? "completed" : "preparing",
    completedAt: d.completedAt ?? null,
    completedBy: d.completedBy === "kitchen" || d.completedBy === "auto" ? d.completedBy : null,
    prepDurationSec: prepDurationOrDefault(d.prepDurationSec),
  };
}

/** All products, in the admin-defined order. */
export function useProducts(): Live<Product[]> {
  const preview = useContext(PreviewContext);
  const [state, setState] = useState<Live<Product[]>>({ status: "loading" });
  useEffect(() => {
    if (preview) return;
    return onSnapshot(
      query(collection(db, "products"), orderBy("order", "asc")),
      { includeMetadataChanges: true },
      (snap) => setState({ status: "ready", data: snap.docs.map(toProduct), fromCache: snap.metadata.fromCache }),
      (error) => setState({ status: "error", error }),
    );
  }, [preview]);
  return preview ? { status: "ready", data: preview.products, fromCache: false } : state;
}

/** The shop's sauce list; falls back to the defaults until an admin saves one. */
export function useSauces(): Live<{ list: string[]; isDefault: boolean }> {
  const preview = useContext(PreviewContext);
  const [state, setState] = useState<Live<{ list: string[]; isDefault: boolean }>>({ status: "loading" });
  useEffect(() => {
    if (preview) return;
    return onSnapshot(
      doc(db, "settings", "sauces"),
      (snap) => {
        const list = snap.get("list");
        setState({
          status: "ready",
          data: Array.isArray(list)
            ? { list: list.map(String), isDefault: false }
            : { list: [...DEFAULT_SAUCES], isDefault: true },
          fromCache: snap.metadata.fromCache,
        });
      },
      (error) => setState({ status: "error", error }),
    );
  }, [preview]);
  return preview ? { status: "ready", data: { list: preview.sauces, isDefault: false }, fromCache: false } : state;
}

/**
 * settings/kitchen.prepDurationSec, live. Falls back to 300 s while the
 * document is missing (isDefault) or unreadable, so the cashier can always sell.
 */
export function useKitchenSettings(): Live<{ prepDurationSec: number; isDefault: boolean }> {
  const preview = useContext(PreviewContext);
  const [state, setState] = useState<Live<{ prepDurationSec: number; isDefault: boolean }>>({ status: "loading" });
  useEffect(() => {
    if (preview) return;
    return onSnapshot(
      doc(db, "settings", "kitchen"),
      (snap) => {
        const value = snap.get("prepDurationSec");
        setState({
          status: "ready",
          data: { prepDurationSec: prepDurationOrDefault(value), isDefault: !snap.exists() },
          fromCache: snap.metadata.fromCache,
        });
      },
      (error) => setState({ status: "error", error }),
    );
  }, [preview]);
  if (preview) {
    return { status: "ready", data: { prepDurationSec: preview.prepDurationSec ?? DEFAULT_PREP_SEC, isDefault: false }, fromCache: false };
  }
  return state;
}

/** Orders of one shop day, by number. */
export function useOrdersOfDay(day: string): Live<Order[]> {
  // State is tagged with its day, so switching days shows "loading" without a reset in the effect.
  const preview = useContext(PreviewContext);
  const [state, setState] = useState<{ day: string; live: Live<Order[]> } | null>(null);
  useEffect(() => {
    if (preview) return;
    // Equality on one field only: no composite index needed. Sorted here.
    return onSnapshot(
        query(collection(db, "orders"), where("day", "==", day)),
        (snap) =>
          setState({
            day,
            live: {
              status: "ready",
              data: snap.docs.map(toOrder).sort((a, b) => a.number - b.number),
              fromCache: snap.metadata.fromCache,
            },
          }),
      (error) => setState({ day, live: { status: "error", error } }),
    );
  }, [day, preview]);
  if (preview) {
    return { status: "ready", data: preview.orders.filter((o) => o.day === day), fromCache: false };
  }
  return state && state.day === day ? state.live : { status: "loading" };
}

/** Browser online/offline flag. */
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function errorMessage(error: unknown, fallback: string, permissionDenied: string): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "permission-denied" || code === "storage/unauthorized") return permissionDenied;
  return fallback;
}
