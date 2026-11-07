"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth-context";
import { LogoutButton } from "./LogoutButton";
import { t } from "@/lib/i18n";
import type { Role, UserProfile } from "@/lib/types";
import type { User } from "firebase/auth";
import styles from "./RoleGate.module.css";

interface Props {
  allow: readonly Role[];
  children: (session: { user: User; profile: UserProfile }) => ReactNode;
}

export function RoleGate({ allow, children }: Props) {
  const state = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "signedOut") router.replace("/login");
  }, [state.status, router]);

  if (state.status === "loading" || state.status === "signingOut" || state.status === "signedOut") {
    return (
      <div className={styles.center} role="status" aria-live="polite">
        <p className={styles.muted}>{t.common.loading}</p>
      </div>
    );
  }

  if (state.status === "noRole" || state.status === "error") {
    return (
      <div className={styles.center}>
        <div className={styles.panel}>
          <h1 className={styles.title}>{t.auth.noRoleTitle}</h1>
          <p>{state.status === "noRole" ? t.auth.noRole : `${t.auth.profileError} ${state.message}`}</p>
          <p className={styles.muted}>{state.user.email}</p>
          <div className={styles.actions}>
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  const { role } = state.profile;
  if (!allow.includes(role)) {
    return (
      <div className={styles.center}>
        <div className={styles.panel}>
          <h1 className={styles.title}>{t.auth.forbiddenTitle}</h1>
          <p>{t.auth.forbidden(t.roles[role])}</p>
          <div className={styles.actions}>
            <Link className="btn btn-primary" href={HOME_BY_ROLE[role]}>
              {t.auth.goToMyStation}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  return <>{children({ user: state.user, profile: state.profile })}</>;
}
