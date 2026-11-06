import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * /preview/* renders the real screens from fixture data so they can be
 * reviewed and linted without Firebase accounts. Development only.
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
