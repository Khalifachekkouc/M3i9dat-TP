"use client";

import { useEffect, useRef, useState } from "react";
import { CustomerTicket, ShopTicket } from "@/components/Tickets";
import { t } from "@/lib/i18n";
import type { PlacedOrder } from "@/lib/orders";
import { downloadTicketPdf } from "@/lib/ticket-pdf";
import { formatOrderNumber, ticketFileName, type TicketKind } from "@/lib/ticket-format";
import styles from "./cashier.module.css";

const tm = t.ticketModal;

type Busy = TicketKind | "both" | null;

/**
 * Shown after « Valider la commande »: both tickets side by side (stacked on a
 * phone), each downloadable as a PDF. The cart is already empty; the one
 * primary action closes the window for the next customer.
 */
export function TicketsDialog({ order, onClose }: { order: PlacedOrder; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const shopRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // showModal() focuses the first button (a download); the cashier's next
    // move is the next customer, so Enter should mean « Nouvelle commande ».
    primaryRef.current?.focus();
  }, []);

  const elementFor = (kind: TicketKind) => (kind === "client" ? customerRef.current : shopRef.current);

  async function download(kinds: TicketKind[], label: Busy) {
    setBusy(label);
    setError(null);
    try {
      for (const [i, kind] of kinds.entries()) {
        const el = elementFor(kind);
        if (!el) continue;
        // Two separate files; a short pause keeps browsers from merging the downloads.
        if (i > 0) await new Promise((r) => setTimeout(r, 400));
        await downloadTicketPdf(el, ticketFileName(kind, order.number));
      }
    } catch {
      setError(tm.pdfError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="tickets-title"
      // Esc closes it like the button: the order is saved, the cart is empty.
      onClose={onClose}
    >
      <div className={styles.dialogHead}>
        <h2 id="tickets-title" className={styles.dialogTitle}>
          {tm.title(formatOrderNumber(order.number))}
        </h2>
        {order.alreadySaved && <p className={styles.dialogNote}>{t.cashier.alreadySaved}</p>}
        {order.differs && (
          <p className={styles.dialogWarning} role="alert">
            {t.cashier.alreadySavedDiffers}
          </p>
        )}
      </div>

      <div className={styles.ticketsRow}>
        <section className={styles.ticketCol} aria-label={t.ticket.customerLabel}>
          <div className={styles.ticketPaper}>
            <CustomerTicket ref={customerRef} order={order} />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            aria-busy={busy === "client"}
            onClick={() => download(["client"], "client")}
          >
            {busy === "client" ? tm.downloading : tm.download}
            <span className="visually-hidden"> {t.ticket.customerLabel}</span>
          </button>
        </section>

        <section className={styles.ticketCol} aria-label={t.ticket.shopLabel}>
          <div className={styles.ticketPaper}>
            <ShopTicket ref={shopRef} order={order} />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            aria-busy={busy === "magasin"}
            onClick={() => download(["magasin"], "magasin")}
          >
            {busy === "magasin" ? tm.downloading : tm.download}
            <span className="visually-hidden"> {t.ticket.shopLabel}</span>
          </button>
        </section>
      </div>

      {error && (
        <div className="banner" data-tone="error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className={styles.dialogFoot}>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          aria-busy={busy === "both"}
          onClick={() => download(["client", "magasin"], "both")}
        >
          {busy === "both" ? tm.downloading : tm.downloadBoth}
        </button>
        <button ref={primaryRef} type="button" className="btn btn-primary btn-lg" onClick={() => dialogRef.current?.close()}>
          {tm.newOrder}
        </button>
      </div>
    </dialog>
  );
}
