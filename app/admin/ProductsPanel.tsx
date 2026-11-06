"use client";

/* eslint-disable @next/next/no-img-element -- Firebase Storage URLs; next/image would need remotePatterns and a server optimiser for no gain on a back office */
import { useMemo, useState } from "react";
import { deleteProduct, moveProduct, setAvailable } from "@/lib/admin-actions";
import { errorMessage, useProducts, useSauces } from "@/lib/data";
import { formatMAD, t } from "@/lib/i18n";
import type { Product } from "@/lib/types";
import { ProductForm } from "./ProductForm";
import styles from "./admin.module.css";

type Editing = { mode: "create" } | { mode: "edit"; product: Product } | null;

const tp = t.admin.products;

export function ProductsPanel() {
  const products = useProducts();
  const sauces = useSauces();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const list = useMemo(() => (products.status === "ready" ? products.data : []), [products]);
  const categories = useMemo(() => [...new Set(list.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "fr")), [list]);
  const sauceList = sauces.status === "ready" ? sauces.data.list : [];

  async function run(id: string, action: () => Promise<void>, success?: string) {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, tp.saveError, t.common.permissionDenied) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="products-heading">
      <div className={styles.listCol}>
        <div className={styles.sectionHead}>
          <h2 id="products-heading" className={styles.heading}>
            {tp.heading}
            {products.status === "ready" && <span className={`${styles.count} num`}>{list.length}</span>}
          </h2>
          <button
            type="button"
            className={editing ? "btn" : "btn btn-primary"}
            onClick={() => {
              setEditing({ mode: "create" });
              setNotice(null);
            }}
            aria-expanded={editing?.mode === "create"}
          >
            {tp.add}
          </button>
        </div>

        {notice && (
          <div className="banner" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
            <span>{notice.text}</span>
          </div>
        )}

        {products.status === "loading" && (
          <div className={styles.skeletonList} role="status" aria-label={t.common.loading}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={`skeleton ${styles.skeletonRow}`} />
            ))}
          </div>
        )}

        {products.status === "error" && (
          <div className="banner" data-tone="error" role="alert">
            <span>{errorMessage(products.error, tp.loadError, t.common.permissionDenied)}</span>
          </div>
        )}

        {products.status === "ready" && list.length === 0 && (
          <div className={styles.empty}>
            <p>{tp.empty}</p>
            <button type="button" className="btn" onClick={() => setEditing({ mode: "create" })}>
              {tp.add}
            </button>
          </div>
        )}

        {products.status === "ready" && list.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.productsTable}`}>
              <thead>
                <tr>
                  <th scope="col" className={styles.colPos}>
                    {tp.position}
                  </th>
                  <th scope="col">{tp.name}</th>
                  <th scope="col">{tp.category}</th>
                  <th scope="col" className={styles.right}>
                    {tp.price}
                  </th>
                  <th scope="col">{tp.availableShort}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t.common.edit}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((p, i) => {
                  const busy = busyId === p.id;
                  const isEditing = editing?.mode === "edit" && editing.product.id === p.id;
                  return (
                    <tr key={p.id} aria-busy={busy} data-editing={isEditing || undefined}>
                      <td className={styles.colPos}>
                        <div className={styles.moveGroup}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label={tp.moveUp(p.name)}
                            disabled={i === 0 || busyId !== null}
                            onClick={() => run(p.id, () => moveProduct(list, p.id, -1))}
                          >
                            <Arrow up />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label={tp.moveDown(p.name)}
                            disabled={i === list.length - 1 || busyId !== null}
                            onClick={() => run(p.id, () => moveProduct(list, p.id, 1))}
                          >
                            <Arrow />
                          </button>
                        </div>
                      </td>
                      <th scope="row" className={styles.nameCell}>
                        <span className={styles.thumb}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" width={48} height={48} loading={i < 12 ? "eager" : "lazy"} />
                          ) : (
                            <span className={styles.thumbEmpty} aria-hidden="true" />
                          )}
                        </span>
                        <span>{p.name}</span>
                      </th>
                      <td className={styles.catCell}>{p.category}</td>
                      <td className={`${styles.right} ${styles.priceCell} num`}>{formatMAD(p.price)}</td>
                      <td className={styles.availCell}>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            role="switch"
                            checked={p.available}
                            disabled={busy}
                            aria-label={tp.toggleAvailable(p.name)}
                            onChange={(e) => run(p.id, () => setAvailable(p.id, e.target.checked))}
                          />
                          <span aria-hidden="true">{p.available ? tp.availableShort : tp.unavailableShort}</span>
                        </label>
                      </td>
                      <td className={styles.actionsCell}>
                        {confirmingDelete === p.id ? (
                          <div className={styles.confirm} role="group" aria-label={tp.deleteConfirm(p.name)}>
                            <span>{tp.deleteConfirm(p.name)}</span>
                            <button
                              type="button"
                              className="btn btn-danger"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  p.id,
                                  async () => {
                                    await deleteProduct(p);
                                    setConfirmingDelete(null);
                                    if (isEditing) setEditing(null);
                                  },
                                  tp.deleted,
                                )
                              }
                            >
                              {tp.deleteYes}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(null)}>
                              {t.common.cancel}
                            </button>
                          </div>
                        ) : (
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className="btn"
                              aria-pressed={isEditing}
                              onClick={() => {
                                setEditing({ mode: "edit", product: p });
                                setNotice(null);
                              }}
                            >
                              {t.common.edit}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(p.id)}>
                              {t.common.delete}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <aside className={styles.editorCol} aria-label={editing.mode === "create" ? tp.createTitle : tp.editTitle}>
          <ProductForm
            key={editing.mode === "edit" ? editing.product.id : "create"}
            product={editing.mode === "edit" ? (list.find((p) => p.id === editing.product.id) ?? editing.product) : null}
            categories={categories}
            sauces={sauceList}
            nextOrder={(list.at(-1)?.order ?? 0) + 10}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setNotice({ tone: "success", text: tp.saved });
            }}
          />
        </aside>
      )}
    </section>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={up ? undefined : styles.flip}>
      <path d="M12 5l-7 7h4.5v7h5v-7H19z" fill="currentColor" />
    </svg>
  );
}
