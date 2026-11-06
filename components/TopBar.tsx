"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth-context";
import { useOnline } from "@/lib/data";
import { t } from "@/lib/i18n";
import type { Role } from "@/lib/types";
import styles from "./TopBar.module.css";

const STATIONS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/cashier", label: t.roles.cashier, roles: ["admin", "cashier"] },
  { href: "/kitchen", label: t.roles.kitchen, roles: ["admin", "kitchen"] },
  { href: "/admin", label: t.roles.admin, roles: ["admin"] },
];

interface Props {
  role: Role;
  email?: string | null;
  /** Extra controls for the current station, placed before the account block. */
  children?: ReactNode;
}

export function TopBar({ role, email, children }: Props) {
  const pathname = usePathname();
  const online = useOnline();
  const stations = STATIONS.filter((s) => s.roles.includes(role));

  return (
    <header className={`${styles.bar} screen-only`}>
      <Link href="/" className={styles.wordmark} aria-label={`${t.shopName}, ${t.nav.home}`}>
        {t.shopName}
      </Link>

      {stations.length > 1 && (
        <nav aria-label={t.nav.label} className={styles.nav}>
          {stations.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={styles.link}
              aria-current={pathname.startsWith(s.href) ? "page" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}

      <div className={styles.end}>
        {children}
        {!online && (
          <span className={styles.offline} role="status">
            {t.common.offline}
          </span>
        )}
        {email && <span className={styles.email}>{email}</span>}
        <button type="button" className={styles.signOut} onClick={() => signOut()}>
          {t.common.signOut}
        </button>
      </div>
    </header>
  );
}
