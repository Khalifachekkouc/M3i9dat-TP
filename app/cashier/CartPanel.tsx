"use client";

import { useState, type Dispatch } from "react";
import { cartCount, needsSauce, type CartAction, type CartLine } from "@/lib/cart";
import { formatMAD, t } from "@/lib/i18n";
import styles from "./cashier.module.css";

const tc = t.cashier;

interface Props {
  lines: CartLine[];
  dispatch: Dispatch<CartAction>;
  total: number;
  pendingSauces: number;
  saving: boolean;
  saveError: string | null;
  open: boolean;
  onToggle: () => void;
  onValidate: () => void;
  onClear: () => void;
}

export function CartPanel({
  lines,
  dispatch,
  total,
  pendingSauces,
  saving,
  saveError,
  open,
  onToggle,
  onValidate,
  onClear,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <aside className={styles.cart} data-sheet={open ? "open" : "closed"} aria-labelledby="cart-heading">
      <div className={styles.cartHead}>
        <h2 id="cart-heading" className={styles.cartTitle}>
          {tc.cartTitle}
        </h2>
        <span className={`${styles.cartCount} num`} aria-live="polite">
          {tc.articles(cartCount(lines))}
        </span>
        <button type="button" className={`btn btn-ghost ${styles.cartClose}`} onClick={onToggle} aria-expanded={open}>
          {t.common.close}
        </button>
      </div>

      {lines.length === 0 ? (
        <p className={styles.cartEmpty}>{tc.cartEmpty}</p>
      ) : (
        <ol className={styles.lines}>
          {lines.map((line) => {
            const pending = needsSauce(line);
            return (
              <li key={line.key} className={styles.line} data-pending={pending || undefined}>
                <div className={styles.lineHead}>
                  <span className={`${styles.lineQty} num`}>{line.qty} ×</span>
                  <span className={styles.lineName}>{line.name}</span>
                  <span className={`${styles.linePrice} num`}>{formatMAD(line.price * line.qty)}</span>
                </div>

                {line.sauceChoices.length > 0 && (
                  <div className={styles.sauces} role="group" aria-label={tc.saucesLabel(line.name)}>
                    {line.sauceChoices.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip"
                        aria-pressed={line.sauces.includes(s)}
                        onClick={() => dispatch({ type: "toggleSauce", key: line.key, sauce: s })}
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={line.sauceChosen && line.sauces.length === 0}
                      onClick={() => dispatch({ type: "noSauce", key: line.key })}
                    >
                      {tc.noSauce}
                    </button>
                    {pending && <span className={styles.pendingHint}>{tc.chooseSauce}</span>}
                  </div>
                )}

                <div className={styles.lineActions}>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={tc.decrease(line.name)}
                      onClick={() => dispatch({ type: "dec", key: line.key })}
                    >
                      <Minus />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={tc.increase(line.name)}
                      onClick={() => dispatch({ type: "inc", key: line.key })}
                    >
                      <Plus />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-expanded={line.noteOpen}
                    onClick={() => dispatch({ type: "toggleNote", key: line.key })}
                  >
                    {tc.addNote}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost ${styles.remove}`}
                    aria-label={tc.remove(line.name)}
                    onClick={() => dispatch({ type: "remove", key: line.key })}
                  >
                    {t.common.delete}
                  </button>
                </div>

                {line.noteOpen && (
                  <input
                    className="input"
                    aria-label={tc.noteLabel(line.name)}
                    placeholder={tc.notePlaceholder}
                    maxLength={120}
                    autoComplete="off"
                    value={line.note}
                    onChange={(e) => dispatch({ type: "note", key: line.key, note: e.target.value })}
                  />
                )}
                {!line.noteOpen && line.note && <p className={styles.noteText}>{line.note}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {lines.length > 0 && (
        <div className={styles.cartFoot}>
          <p className={styles.total}>
            <span>{tc.total}</span>
            <span className="num">{formatMAD(total)}</span>
          </p>

          {saveError && (
            <div className="banner" data-tone="error" role="alert">
              <span>{saveError}</span>
            </div>
          )}
          {pendingSauces > 0 && (
            <p className={styles.pendingNote} role="status">
              {tc.missingSauces(pendingSauces)}
            </p>
          )}

          <button
            type="button"
            className={`btn btn-primary btn-lg ${styles.validate}`}
            disabled={pendingSauces > 0 || saving}
            aria-busy={saving}
            onClick={onValidate}
          >
            {saving ? tc.validating : tc.validate}
          </button>

          {confirmClear ? (
            <div className={styles.clearConfirm} role="group" aria-label={tc.clearConfirm}>
              <span>{tc.clearConfirm}</span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
              >
                {t.common.yes}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                {t.common.no}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(true)} disabled={saving}>
              {tc.clear}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function Plus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor" />
    </svg>
  );
}

function Minus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 11h14v2H5z" fill="currentColor" />
    </svg>
  );
}
