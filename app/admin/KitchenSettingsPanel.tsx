"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { errorMessage, useKitchenSettings } from "@/lib/data";
import { t } from "@/lib/i18n";
import { parsePrepInput, splitPrepDuration } from "@/lib/kitchen-settings";
import styles from "./admin.module.css";

const tk = t.admin.kitchen;

const describe = (total: number) => {
  const { minutes, seconds } = splitPrepDuration(total);
  return tk.duration(minutes, seconds);
};

export function KitchenSettingsPanel() {
  const settings = useKitchenSettings();

  return (
    <section className={styles.narrow} aria-labelledby="kitchen-heading">
      <h2 id="kitchen-heading" className={styles.heading}>
        {tk.heading}
      </h2>
      <p className={styles.lead}>{tk.lead}</p>

      {settings.status === "loading" && (
        <div className={`skeleton ${styles.skeletonRow}`} role="status" aria-label={t.common.loading} />
      )}
      {settings.status === "error" && (
        <div className="banner" data-tone="error" role="alert">
          <span>{errorMessage(settings.error, t.common.unknownError, t.common.permissionDenied)}</span>
        </div>
      )}
      {settings.status === "ready" && (
        // Keyed by the stored value: the fields start from it, and reset when it changes elsewhere.
        <PrepForm
          key={settings.data.prepDurationSec}
          current={settings.data.prepDurationSec}
          isDefault={settings.data.isDefault}
        />
      )}
    </section>
  );
}

function PrepForm({ current, isDefault }: { current: number; isDefault: boolean }) {
  const uid = useId();
  const start = splitPrepDuration(current);
  const [minutes, setMinutes] = useState(String(start.minutes));
  const [seconds, setSeconds] = useState(String(start.seconds));
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const minutesRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const parsed = parsePrepInput(minutes, seconds);
    if (!parsed.ok) {
      setInputError(parsed.reason === "format" ? tk.format : parsed.reason === "tooShort" ? tk.tooShort : tk.tooLong);
      minutesRef.current?.focus();
      return;
    }
    setInputError(null);
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "kitchen"), { prepDurationSec: parsed.seconds });
      setNotice({ tone: "success", text: tk.saved(describe(parsed.seconds)) });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, tk.saveError, t.common.permissionDenied) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.prepForm} onSubmit={onSubmit} noValidate>
      <p className={styles.prepCurrent}>
        {tk.current(describe(current))}
        {isDefault && <span className={styles.muted}> {tk.defaultNote}</span>}
      </p>

      <fieldset className={styles.fieldset} aria-describedby={`${uid}-help`}>
        <legend className="field-label">{tk.heading}</legend>
        <div className={styles.prepFields}>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-min`}>
              {tk.minutes}
            </label>
            <input
              ref={minutesRef}
              id={`${uid}-min`}
              name="minutes"
              className={`input num ${styles.prepInput}`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-invalid={inputError ? true : undefined}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-sec`}>
              {tk.seconds}
            </label>
            <input
              id={`${uid}-sec`}
              name="seconds"
              className={`input num ${styles.prepInput}`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              aria-invalid={inputError ? true : undefined}
            />
          </div>
        </div>
        <p id={`${uid}-help`} className="field-help" data-error={inputError ? "true" : undefined} aria-live="polite">
          {inputError ?? tk.bounds}
        </p>
      </fieldset>

      {notice && (
        <div className="banner" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
          <span>{notice.text}</span>
        </div>
      )}

      <div className={styles.formActions}>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? t.common.saving : t.common.save}
        </button>
      </div>
    </form>
  );
}
