"use client";

/* eslint-disable @next/next/no-img-element -- Firebase Storage URLs, shown at a fixed small size */
import { useContext, useEffect, useMemo, useReducer, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { cartCount, cartReducer, loadCart, needsSauce, saveCart, toOrderItems } from "@/lib/cart";
import { errorMessage, useOnline, useProducts, useSauces } from "@/lib/data";
import { formatMAD, t } from "@/lib/i18n";
import { clearPendingOrderId, pendingOrderId } from "@/lib/order-core";
import { newOrderId, orderTotal, placeOrder, type PlacedOrder } from "@/lib/orders";
import { PreviewContext } from "@/lib/preview-context";
import type { Product, Role } from "@/lib/types";
import { CartPanel } from "./CartPanel";
import { TicketsDialog } from "./TicketsDialog";
import styles from "./cashier.module.css";

const tc = t.cashier;
const ALL = "__all__";

interface Props {
  uid: string;
  email: string | null;
  role: Role;
}

export function CashierScreen({ uid, email, role }: Props) {
  const products = useProducts();
  const sauces = useSauces();
  const online = useOnline();
  // /preview injects a local save so the whole flow can be tried without Firebase.
  const save = useContext(PreviewContext)?.placeOrder ?? placeOrder;

  // Only mounted in the browser (behind the auth gate), so storage is readable here.
  const [lines, dispatch] = useReducer(cartReducer, undefined, loadCart);
  const [category, setCategory] = useState<string>(ALL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<PlacedOrder | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => saveCart(lines), [lines]);

  const allProducts = useMemo(() => (products.status === "ready" ? products.data : []), [products]);
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const p of allProducts) if (!seen.includes(p.category)) seen.push(p.category);
    return seen;
  }, [allProducts]);
  const activeCategory = category === ALL || categories.includes(category) ? category : ALL;
  const shown = activeCategory === ALL ? allProducts : allProducts.filter((p) => p.category === activeCategory);

  const shopSauces = sauces.status === "ready" ? sauces.data.list : null;
  const sauceChoicesFor = (p: Product) =>
    shopSauces ? shopSauces.filter((s) => p.sauceOptions.includes(s)) : p.sauceOptions;

  const items = toOrderItems(lines);
  const total = orderTotal(items);
  const pendingSauces = lines.filter(needsSauce).length;

  function add(p: Product) {
    setSaveError(null);
    dispatch({ type: "add", product: p, sauceChoices: sauceChoicesFor(p) });
  }

  async function validate() {
    if (lines.length === 0 || pendingSauces > 0 || saving) return;
    if (!online) {
      setSaveError(tc.offlineSave);
      return;
    }
    setSaving(true);
    setSaveError(null);
    // Same document id on every attempt for this cart (kept in localStorage):
    // if an earlier attempt was saved but its answer lost, this finds it.
    const orderId = pendingOrderId(localStorage, newOrderId);
    try {
      const order = await save(orderId, items, uid);
      clearPendingOrderId(localStorage);
      // The cart empties now; the tickets open in a window over the screen.
      dispatch({ type: "clear" });
      setCartOpen(false);
      setLastOrder(order);
    } catch (error) {
      // The cart and its pending id are kept: validating again is safe.
      const code = (error as { code?: string }).code;
      const message =
        code === "unavailable" || code === "deadline-exceeded"
          ? tc.offlineSave
          : errorMessage(error, tc.saveError, t.common.permissionDenied);
      setSaveError(`${message} ${tc.retrySafe}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.shell}>
      <TopBar role={role} email={email} />

      <main className={styles.layout}>
        <section className={styles.menu} aria-labelledby="menu-heading">
          <h1 id="menu-heading" className="visually-hidden">
            {tc.title}
          </h1>

          {categories.length > 1 && (
            <div className={styles.categories} role="group" aria-label={tc.categoriesLabel}>
              {[ALL, ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={activeCategory === c}
                  onClick={() => setCategory(c)}
                >
                  {c === ALL ? tc.allCategories : c}
                </button>
              ))}
            </div>
          )}

          {products.status === "loading" && (
            <div className={styles.grid} role="status" aria-label={t.common.loading}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={`skeleton ${styles.tileSkeleton}`} />
              ))}
            </div>
          )}

          {products.status === "error" && (
            <div className="banner" data-tone="error" role="alert">
              <span>{errorMessage(products.error, tc.loadError, t.common.permissionDenied)}</span>
            </div>
          )}

          {products.status === "ready" && allProducts.length === 0 && (
            <div className={styles.emptyMenu}>
              <h2 className={styles.emptyTitle}>{tc.emptyMenuTitle}</h2>
              <p>{tc.emptyMenu}</p>
            </div>
          )}

          {products.status === "ready" && shown.length > 0 && (
            <ul className={styles.grid} aria-label={tc.productsLabel}>
              {shown.map((p, i) => (
                <li key={p.id}>
                  <button type="button" className={styles.tile} disabled={!p.available} onClick={() => add(p)}>
                    <span className={styles.tileImage}>
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          width={320}
                          height={240}
                          loading={i < 10 ? "eager" : "lazy"}
                          fetchPriority={i < 4 ? "high" : undefined}
                          decoding="async"
                        />
                      ) : (
                        <span className={styles.tileNoImage}>{p.name}</span>
                      )}
                    </span>
                    <span className={styles.tileName}>{p.name}</span>
                    <span className={`${styles.tilePrice} num`}>
                      {p.available ? formatMAD(p.price) : t.products.unavailable}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <CartPanel
          lines={lines}
          dispatch={dispatch}
          total={total}
          pendingSauces={pendingSauces}
          saving={saving}
          saveError={saveError}
          open={cartOpen}
          onToggle={() => setCartOpen((o) => !o)}
          onValidate={validate}
          onClear={() => {
            // The cashier explicitly starts a new cart: forget the pending id.
            clearPendingOrderId(localStorage);
            dispatch({ type: "clear" });
            setSaveError(null);
          }}
        />
      </main>

      {/* Phone width: a bar that opens the cart */}
      <div className={styles.cartBar} hidden={cartOpen}>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setCartOpen(true)} aria-expanded={cartOpen}>
          <span>{tc.showCart}</span>
          <span className="num">
            {tc.articles(cartCount(lines))}, {formatMAD(total)}
          </span>
        </button>
      </div>

      {lastOrder && <TicketsDialog key={lastOrder.id} order={lastOrder} onClose={() => setLastOrder(null)} />}
    </div>
  );
}
