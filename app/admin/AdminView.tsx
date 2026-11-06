"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TopBar } from "@/components/TopBar";
import { t } from "@/lib/i18n";
import type { Role } from "@/lib/types";
import { ProductsPanel } from "./ProductsPanel";
import { SaucesPanel } from "./SaucesPanel";
import { OrdersPanel } from "./OrdersPanel";
import styles from "./admin.module.css";

const TABS = ["products", "sauces", "orders"] as const;
type Tab = (typeof TABS)[number];

function AdminTabs() {
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "products";

  return (
    <>
      <nav className={styles.tabs} aria-label={t.admin.title}>
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === "products" ? "/admin" : `/admin?tab=${key}`}
            className={styles.tab}
            aria-current={tab === key ? "page" : undefined}
            replace
            scroll={false}
          >
            {t.admin.tabs[key]}
          </Link>
        ))}
      </nav>
      {tab === "products" && <ProductsPanel />}
      {tab === "sauces" && <SaucesPanel />}
      {tab === "orders" && <OrdersPanel />}
    </>
  );
}

export function AdminView({ role, email }: { role: Role; email: string | null }) {
  return (
    <>
      <TopBar role={role} email={email} />
      <main className={styles.main}>
        <h1 className="visually-hidden">{t.admin.title}</h1>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <AdminTabs />
        </Suspense>
      </main>
    </>
  );
}
