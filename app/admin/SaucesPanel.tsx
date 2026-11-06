"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { addSauceToProducts, saveSauces } from "@/lib/admin-actions";
import { errorMessage, useProducts, useSauces } from "@/lib/data";
import { t } from "@/lib/i18n";
import styles from "./admin.module.css";

const ts = t.admin.sauces;

export function SaucesPanel() {
  const sauces = useSauces();
  const products = useProducts();
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [alsoOnProducts, setAlsoOnProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const list = sauces.status === "ready" ? sauces.data.list : [];

  async function persist(next: string[], newSauce?: string) {
    setSaving(true);
    setNotice(null);
    try {
      await saveSauces(next);
      if (newSauce && alsoOnProducts && products.status === "ready") {
        await addSauceToProducts(products.data, newSauce);
      }
      setNotice({ tone: "success", text: ts.saved });
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, ts.saveError, t.common.permissionDenied) });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const name = value.trim().replace(/\s+/g, " ");
    if (!name) return inputRef.current?.focus();
    if (list.some((s) => s.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"))) {
      setInputError(ts.duplicate);
      return inputRef.current?.focus();
    }
    setInputError(null);
    if (await persist([...list, name], name)) setValue("");
  }

  return (
    <section className={styles.narrow} aria-labelledby="sauces-heading">
      <h2 id="sauces-heading" className={styles.heading}>
        {ts.heading}
      </h2>
      <p className={styles.lead}>{ts.lead}</p>

      {notice && (
        <div className="banner" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
          <span>{notice.text}</span>
        </div>
      )}

      {sauces.status === "loading" && <div className={`skeleton ${styles.skeletonRow}`} role="status" aria-label={t.common.loading} />}

      {sauces.status === "error" && (
        <div className="banner" data-tone="error" role="alert">
          <span>{errorMessage(sauces.error, t.common.unknownError, t.common.permissionDenied)}</span>
        </div>
      )}

      {sauces.status === "ready" && (
        <>
          {sauces.data.isDefault && <p className={styles.muted}>{ts.defaultsNote}</p>}
          {list.length === 0 ? (
            <p className={styles.empty}>{ts.empty}</p>
          ) : (
            <ul className={styles.sauceList}>
              {list.map((s) => (
                <li key={s} className={styles.sauceItem}>
                  <span className={styles.sauceName}>{s}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    aria-label={ts.remove(s)}
                    onClick={() => persist(list.filter((x) => x !== s))}
                  >
                    {t.common.delete}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className={styles.addSauce} onSubmit={onAdd} noValidate>
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-sauce`}>
                {ts.newLabel}
              </label>
              <div className={styles.inlineForm}>
                <input
                  ref={inputRef}
                  id={`${uid}-sauce`}
                  name="sauce"
                  className="input"
                  autoComplete="off"
                  maxLength={30}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  aria-invalid={inputError ? true : undefined}
                  aria-describedby={`${uid}-sauce-help`}
                />
                <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
                  {ts.add}
                </button>
              </div>
              <p id={`${uid}-sauce-help`} className="field-help" data-error={inputError ? "true" : undefined}>
                {inputError ?? ""}
              </p>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={alsoOnProducts} onChange={(e) => setAlsoOnProducts(e.target.checked)} />
              <span>{ts.alsoOnProducts}</span>
            </label>
          </form>
        </>
      )}
    </section>
  );
}
