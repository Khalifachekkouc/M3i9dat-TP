"use client";

import { useEffect, useId, useState } from "react";
import { useLogout } from "@/lib/auth-context";
import { t } from "@/lib/i18n";
import styles from "./LogoutButton.module.css";

/** How long « Confirmer » stays up after the first tap; longer when there is a warning to read. */
export const CONFIRM_MS = 3000;
export const CONFIRM_WITH_WARNING_MS = 6000;

interface Props {
  /** Shown with « Confirmer », e.g. the cashier's cart still in progress. */
  warning?: string | null;
  /** "field": on the dark top bar. "plain": a regular button (kitchen header, panels). */
  variant?: "field" | "plain";
}

/**
 * « Déconnexion » in two taps: the first turns it into « Confirmer » for a few
 * seconds, the second logs out. A stray tap on a shared screen does nothing.
 */
export function LogoutButton({ warning = null, variant = "plain" }: Props) {
  const logout = useLogout();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const warningId = useId();
  const confirmMs = warning ? CONFIRM_WITH_WARNING_MS : CONFIRM_MS;

  useEffect(() => {
    if (step !== "confirm") return;
    const timer = setTimeout(() => setStep("idle"), confirmMs);
    return () => clearTimeout(timer);
  }, [step, confirmMs]);

  function onClick() {
    if (step === "idle") {
      setStep("confirm");
      return;
    }
    if (step === "confirm") {
      setStep("busy");
      // On failure the session is shown again; this button starts over.
      logout().catch(() => setStep("idle"));
    }
  }

  const confirming = step === "confirm";
  return (
    <span className={styles.wrap}>
      {confirming && warning && (
        <span id={warningId} className={styles.warning} role="alert">
          {warning}
        </span>
      )}
      <button
        type="button"
        className={variant === "field" ? `${styles.button} ${styles.field}` : `btn ${styles.button}`}
        data-step={step}
        disabled={step === "busy"}
        aria-busy={step === "busy" || undefined}
        aria-describedby={confirming && warning ? warningId : undefined}
        onClick={onClick}
      >
        {confirming ? t.logout.confirm : step === "busy" ? t.logout.busy : t.logout.label}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {confirming ? t.logout.confirmHint(Math.round(confirmMs / 1000)) : ""}
      </span>
    </span>
  );
}
