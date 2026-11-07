/** Ticket kinds; the file name uses the French word the shop uses. */
export type TicketKind = "client" | "magasin";

/** 7 -> "007"; numbers past 999 keep all their digits (1234 -> "1234"). */
export const padOrderNumber = (n: number) => String(Math.max(0, Math.trunc(n))).padStart(3, "0");

/** 7 -> "N° 007", as printed on both tickets. */
export const formatOrderNumber = (n: number) => `N° ${padOrderNumber(n)}`;

/** ("client", 7) -> "ticket-client-N007.pdf" */
export const ticketFileName = (kind: TicketKind, n: number) => `ticket-${kind}-N${padOrderNumber(n)}.pdf`;
