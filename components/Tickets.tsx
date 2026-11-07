import type { Ref } from "react";
import type { PlacedOrder } from "@/lib/orders";
import { formatDateTime, formatMAD, formatTime, t } from "@/lib/i18n";
import { formatOrderNumber } from "@/lib/ticket-format";
import styles from "./Tickets.module.css";

const tt = t.ticket;

type TicketOrder = Pick<PlacedOrder, "number" | "items" | "total" | "printedAt">;

interface Props {
  order: TicketOrder;
  /** The element turned into the PDF: exactly the 80mm card, nothing around it. */
  ref?: Ref<HTMLDivElement>;
}

const sauceText = (sauces: string[]) => (sauces.length > 0 ? sauces.join(" + ") : tt.noSauce);

/** The customer's receipt: light, prices, line totals, grand total. */
export function CustomerTicket({ order, ref }: Props) {
  return (
    <div ref={ref} className={`${styles.ticket} ${styles.customer}`} aria-label={tt.customerLabel}>
      <p className={styles.shopName}>{t.shopName}</p>
      <p className={styles.city}>{t.shopCity}</p>
      <p className={styles.kindLabel}>{tt.customerLabel}</p>

      <div className={styles.headRow}>
        <p className={`${styles.customerNumber} num`}>{formatOrderNumber(order.number)}</p>
        <p className={`${styles.dateTime} num`}>{formatDateTime(order.printedAt)}</p>
      </div>

      <ul className={styles.customerLines}>
        {order.items.map((item, i) => (
          <li key={i} className={styles.customerLine}>
            <span className={styles.lineMain}>
              <span className="num">{item.qty} ×</span> <bdi>{item.name}</bdi>
            </span>
            <span className={`${styles.lineTotal} num`}>{formatMAD(item.price * item.qty)}</span>
            <span className={`${styles.lineDetail} num`}>{tt.unitPrice(formatMAD(item.price))}</span>
            <span className={styles.lineDetail}>
              {tt.sauces} : {sauceText(item.sauces)}
            </span>
            {item.note && (
              <span className={styles.lineDetail}>
                {tt.note} : <bdi>{item.note}</bdi>
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className={styles.totalRow}>
        <span>{tt.total}</span>
        <span className="num">{formatMAD(order.total)}</span>
      </p>
      <p className={styles.thanks}>{tt.thanks}</p>
    </div>
  );
}

/** The shop's ticket: read over the grill. Orange banner, huge number, big items, no prices. */
export function ShopTicket({ order, ref }: Props) {
  return (
    <div ref={ref} className={`${styles.ticket} ${styles.shop}`} aria-label={tt.shopLabel}>
      <p className={styles.banner}>{tt.shopLabel}</p>
      <p className={`${styles.shopNumber} num`}>{formatOrderNumber(order.number)}</p>
      <p className={`${styles.shopTime} num`}>{formatTime(order.printedAt)}</p>

      <ol className={styles.shopItems}>
        {order.items.map((item, i) => (
          <li key={i} className={styles.shopItem}>
            <span className={`${styles.shopQty} num`}>{item.qty} ×</span>
            <bdi className={styles.shopItemName}>{item.name}</bdi>
            <span className={styles.shopSauce} data-none={item.sauces.length === 0 || undefined}>
              {sauceText(item.sauces)}
            </span>
            {item.note && (
              <span className={styles.shopNote}>
                {tt.note} : <bdi>{item.note}</bdi>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
