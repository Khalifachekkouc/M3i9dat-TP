import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "cashier" | "kitchen";

export const ROLES: readonly Role[] = ["admin", "cashier", "kitchen"] as const;

export interface UserProfile {
  role: Role;
  email?: string;
  displayName?: string;
}

export interface Product {
  id: string;
  name: string;
  /** Price in MAD. */
  price: number;
  category: string;
  imageUrl: string;
  /** Storage path of the uploaded image, so it can be deleted with the product. */
  imagePath?: string;
  available: boolean;
  /** Sauces the cashier may pick for this product. Empty = no sauce question (drinks). */
  sauceOptions: string[];
  /** Sort position, ascending. */
  order: number;
  createdAt: Timestamp | null;
}

export type ProductInput = Omit<Product, "id" | "createdAt">;

export interface OrderItem {
  productId: string;
  name: string;
  /** Unit price in MAD at the time of the order. */
  price: number;
  qty: number;
  /** Chosen sauces. Empty array = the cashier explicitly chose "no sauce". */
  sauces: string[];
  note?: string;
}

export interface Order {
  id: string;
  /** Daily sequential number, restarts at 1 every day. */
  number: number;
  /** Local shop day, YYYY-MM-DD (Africa/Casablanca). */
  day: string;
  items: OrderItem[];
  total: number;
  /** Server timestamp. Null only while a local write is pending. */
  createdAt: Timestamp | null;
  createdBy: string;
}

export interface SaucesSettings {
  list: string[];
}

export const DEFAULT_SAUCES = ["Tomate", "Piquante"] as const;
