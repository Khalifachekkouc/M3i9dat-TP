import type { PlacedOrder } from "@/lib/orders";
import { formatDateTime, formatMAD, formatTime, t } from "@/lib/i18n";
import styles from "./Tickets.module.css";

/**
 * Two tickets for an 80mm thermal printer, one per printed page:
 * 1. the customer's, with prices; 2. the shop's, large and kitchen-oriented.
 * Hidden on screen; only `@media print` shows them.
 */
export function Tickets({ order }: { order: PlacedOrder }) {
  return (
    <div className={`print-only ${styles.root}`} aria-hidden="true">
      <section className={styles.ticket}>
        <p className={styles.shop}>{t.shopName}</p>
        <p className={styles.small}>{t.shopCity}</p>
        <p className={styles.copy}>{t.ticket.customerCopy}</p>
        <div className={styles.rule} />
        <p className={styles.customerNumber}>
          {t.ticket.orderNumber} {order.number}
        </p>
        <p className={styles.small}>{formatDateTime(order.printedAt)}</p>
        <div className={styles.rule} />
        <table className={styles.lines}>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i}>
                <td>
                  <span className={styles.itemName}>
                    {item.qty} × {item.name}
                  </span>
                  <span className={styles.detail}>
                    {item.sauces.length > 0 ? item.sauces.join(" + ") : t.ticket.noSauce}
                  </span>
                  {item.note && (
                    <span className={styles.detail}>
                      {t.ticket.note} : {item.note}
                    </span>
                  )}
                  {item.qty > 1 && <span className={styles.detail}>{formatMAD(item.price)} / u</span>}
                </td>
                <td className={styles.price}>{formatMAD(item.price * item.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.ruleStrong} />
        <p className={styles.total}>
          <span>{t.ticket.total}</span>
          <span>{formatMAD(order.total)}</span>
        </p>
        <div className={styles.rule} />
        <p className={styles.thanks}>{t.ticket.thanks}</p>
      </section>

      <section className={`${styles.ticket} ${styles.kitchen}`}>
        <p className={styles.copy}>
          {t.ticket.shopCopy} {formatTime(order.printedAt)}
        </p>
        <p className={styles.kitchenNumber}>{order.number}</p>
        <div className={styles.ruleStrong} />
        <ol className={styles.kitchenItems}>
          {order.items.map((item, i) => (
            <li key={i} className={styles.kitchenItem}>
              <span className={styles.kitchenQty}>{item.qty} ×</span>
              <span className={styles.kitchenName}>{item.name}</span>
              <span className={styles.kitchenSauce}>
                {item.sauces.length > 0 ? item.sauces.join(" + ") : t.ticket.noSauce}
              </span>
              {item.note && (
                <span className={styles.kitchenNote}>
                  {t.ticket.note} : {item.note}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
