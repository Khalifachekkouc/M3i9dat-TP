"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { errorMessage, useOrdersOfDay } from "@/lib/data";
import { dayKey, formatDayKey, formatMAD, formatTime, shiftDayKey, t } from "@/lib/i18n";
import type { OrderItem } from "@/lib/types";
import styles from "./admin.module.css";

const to = t.admin.orders;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function itemLine(item: OrderItem): string {
  const sauces = item.sauces.length > 0 ? item.sauces.join(", ") : t.ticket.noSauce;
  return `${item.qty} × ${item.name} (${sauces})${item.note ? `, ${t.ticket.note.toLowerCase()} : ${item.note}` : ""}`;
}

export function OrdersPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();
  const today = dayKey(new Date());
  const requested = params.get("day");
  const day = requested && DAY_RE.test(requested) ? requested : today;
  const orders = useOrdersOfDay(day);

  function goTo(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("tab", "orders");
    if (next === today) q.delete("day");
    else q.set("day", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  const list = orders.status === "ready" ? orders.data : [];
  const dayTotal = list.reduce((sum, o) => sum + o.total, 0);

  return (
    <section className={styles.historyCol} aria-labelledby="orders-heading">
      <div className={styles.sectionHead}>
        <h2 id="orders-heading" className={styles.heading}>
          {to.heading}
        </h2>
        <div className={styles.dayPicker}>
          <button type="button" className="btn" onClick={() => goTo(shiftDayKey(day, -1))}>
            {to.previousDay}
          </button>
          <label className="visually-hidden" htmlFor={`${uid}-day`}>
            {to.day}
          </label>
          <input
            id={`${uid}-day`}
            type="date"
            className="input"
            value={day}
            max={today}
            onChange={(e) => DAY_RE.test(e.target.value) && goTo(e.target.value)}
          />
          <button type="button" className="btn" disabled={day >= today} onClick={() => goTo(shiftDayKey(day, 1))}>
            {to.nextDay}
          </button>
        </div>
      </div>

      <div className={styles.daySummary}>
        <p className={styles.dayName}>{formatDayKey(day)}</p>
        {orders.status === "ready" && (
          <dl className={styles.stats}>
            <div>
              <dt>{to.dailyTotal}</dt>
              <dd className="num">{formatMAD(dayTotal)}</dd>
            </div>
            <div>
              <dt>{t.admin.tabs.orders}</dt>
              <dd className="num">{to.count(list.length)}</dd>
            </div>
          </dl>
        )}
      </div>

      {orders.status === "loading" && (
        <div className={styles.skeletonList} role="status" aria-label={t.common.loading}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`skeleton ${styles.skeletonRow}`} />
          ))}
        </div>
      )}

      {orders.status === "error" && (
        <div className="banner" data-tone="error" role="alert">
          <span>{errorMessage(orders.error, to.loadError, t.common.permissionDenied)}</span>
        </div>
      )}

      {orders.status === "ready" && list.length === 0 && <p className={styles.empty}>{to.empty}</p>}

      {orders.status === "ready" && list.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{to.colNumber}</th>
                <th scope="col">{to.colTime}</th>
                <th scope="col">{to.colItems}</th>
                <th scope="col" className={styles.right}>
                  {to.colTotal}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className={`${styles.orderNo} num`}>
                    {o.number}
                  </th>
                  <td className="num">{o.createdAt ? formatTime(o.createdAt.toDate()) : ""}</td>
                  <td>
                    <ul className={styles.itemList}>
                      {o.items.map((item, i) => (
                        <li key={i}>{itemLine(item)}</li>
                      ))}
                    </ul>
                  </td>
                  <td className={`${styles.right} num`}>{formatMAD(o.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>
                  {to.dailyTotal}
                </th>
                <td className={`${styles.right} num`}>{formatMAD(dayTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
