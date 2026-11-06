"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth-context";
import { RoleGate } from "@/components/RoleGate";
import { t } from "@/lib/i18n";

/** Sends each account to its own station; the gate handles signed-out and role-less accounts. */
export default function Home() {
  const state = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "ready") router.replace(HOME_BY_ROLE[state.profile.role]);
  }, [state, router]);

  return (
    <RoleGate allow={["admin", "cashier", "kitchen"]}>
      {() => (
        <p role="status" className="visually-hidden">
          {t.common.loading}
        </p>
      )}
    </RoleGate>
  );
}
