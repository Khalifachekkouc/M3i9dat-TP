"use client";

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase";
import type { Product } from "./types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Photo uploads need Firebase Storage. Until it is enabled on the project
 * (Blaze plan), leave NEXT_PUBLIC_STORAGE_ENABLED unset: the admin pastes an
 * image URL instead, and nothing touches Storage.
 */
export const storageEnabled = process.env.NEXT_PUBLIC_STORAGE_ENABLED === "true";

/** An image the product can point to: from Storage (with its path) or any public URL. */
export interface ProductImage {
  imageUrl: string;
  imagePath?: string;
}

/** Same limits as validProduct in firestore.rules: http(s), at most 2048 characters. */
export function parseImageUrl(input: string): string | null {
  const value = input.trim();
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface ProductDraft {
  name: string;
  price: number;
  category: string;
  available: boolean;
  sauceOptions: string[];
}

/** A fresh product id, so the image can be uploaded under it before the doc exists. */
export const newProductId = () => doc(collection(db, "products")).id;

export async function uploadProductImage(
  productId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ imageUrl: string; imagePath: string }> {
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
  const imagePath = `products/${productId}/${Date.now()}-${safe}`;
  const task = uploadBytesResumable(ref(storage, imagePath), file, {
    contentType: file.type,
    cacheControl: "public, max-age=31536000",
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (s) => onProgress(Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100)),
      reject,
      () => resolve(),
    );
  });
  return { imageUrl: await getDownloadURL(task.snapshot.ref), imagePath };
}

/** Best effort: a leftover file costs storage, never correctness. */
export async function deleteImageQuietly(path: string | undefined) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Already gone, or no permission: nothing to do.
  }
}

export async function createProduct(id: string, draft: ProductDraft, image: ProductImage | null, order: number) {
  await setDoc(doc(db, "products", id), {
    ...draft,
    imageUrl: image?.imageUrl ?? "",
    ...(image?.imagePath ? { imagePath: image.imagePath } : {}),
    order,
    createdAt: serverTimestamp(),
  });
}

export async function updateProduct(
  id: string,
  draft: ProductDraft,
  image: ProductImage | null | "remove" | "keep",
) {
  const imageFields =
    image === "keep"
      ? {}
      : image === "remove" || image === null
        ? { imageUrl: "", imagePath: deleteField() }
        : { imageUrl: image.imageUrl, imagePath: image.imagePath ?? deleteField() };
  await updateDoc(doc(db, "products", id), { ...draft, ...imageFields });
}

export async function setAvailable(id: string, available: boolean) {
  await updateDoc(doc(db, "products", id), { available });
}

export async function deleteProduct(product: Product) {
  await deleteDoc(doc(db, "products", product.id));
  await deleteImageQuietly(product.imagePath);
}

/**
 * Move one product up or down. Rewrites `order` as 10, 20, 30… for every
 * product whose position changed, so duplicate or missing values heal.
 */
export async function moveProduct(products: Product[], id: string, direction: -1 | 1) {
  const list = [...products];
  const from = list.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  const batch = writeBatch(db);
  list.forEach((p, i) => {
    const order = (i + 1) * 10;
    if (p.order !== order) batch.update(doc(db, "products", p.id), { order });
  });
  await batch.commit();
}

export async function saveSauces(list: string[]) {
  await setDoc(doc(db, "settings", "sauces"), { list });
}

/** Offer a new sauce on every product that already offers at least one sauce. */
export async function addSauceToProducts(products: Product[], sauce: string) {
  const targets = products.filter((p) => p.sauceOptions.length > 0 && !p.sauceOptions.includes(sauce));
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    for (const p of targets.slice(i, i + 400)) {
      batch.update(doc(db, "products", p.id), { sauceOptions: [...p.sauceOptions, sauce] });
    }
    await batch.commit();
  }
}

/** "12,5" or "12.5" -> 12.5; NaN when not a price. */
export function parsePrice(input: string): number {
  const n = Number(input.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : Number.NaN;
}
