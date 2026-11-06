"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth-context";
import { t } from "@/lib/i18n";
import styles from "./login.module.css";

function messageFor(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return t.auth.errorCredentials;
    case "auth/too-many-requests":
      return t.auth.errorTooMany;
    case "auth/network-request-failed":
      return t.auth.errorNetwork;
    case "auth/user-disabled":
      return t.auth.errorDisabled;
    default:
      return t.common.unknownError;
  }
}

export default function LoginPage() {
  const state = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "ready") router.replace(HOME_BY_ROLE[state.profile.role]);
    if (state.status === "noRole" || state.status === "error") router.replace("/");
  }, [state, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, String(form.get("email")).trim(), String(form.get("password")));
      // The effect above redirects once the role is loaded.
    } catch (err) {
      setError(messageFor(err));
      setSubmitting(false);
      emailRef.current?.focus();
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brand} aria-label={t.shopName}>
        <p className={styles.wordmark}>{t.shopName}</p>
        <p className={styles.city}>{t.shopCity}</p>
      </section>

      <section className={styles.formSide}>
        <form className={styles.form} onSubmit={onSubmit} noValidate={false}>
          <h1 className={styles.title}>{t.auth.title}</h1>
          <p className={styles.lead}>{t.auth.lead}</p>

          <div className="field">
            <label className="field-label" htmlFor="email">
              {t.auth.email}
            </label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              className="input"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              {t.auth.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <p id="login-error" className="field-help" data-error={error ? "true" : undefined} role="alert">
            {error ?? ""}
          </p>

          <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
            {submitting ? t.auth.submitting : t.auth.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
