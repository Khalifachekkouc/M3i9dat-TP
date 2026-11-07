"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { LogoutButton } from "@/components/LogoutButton";
import { errorMessage, toOrder, useOnline } from "@/lib/data";
import { dayKey, formatTime, t } from "@/lib/i18n";
import { cardTiming, detectArrivals, prepMsOf, previousDay, splitZones } from "@/lib/kitchen";
import { useKitchenSound, useSoundPrompt, type SoundState } from "@/lib/kitchen-sound";
import { useServerClockOffset, useTick } from "@/lib/server-clock";
import { formatOrderNumber } from "@/lib/ticket-format";
import type { Order } from "@/lib/types";
import styles from "./kitchen.module.css";

const tk = t.kitchen;
const FLASH_MS = 6000;
const RETRY_MS = 5000;

export type KitchenOrder = Omit<Order, "completedBy"> & {
  createdMs: number | null;
  completedMs: number | null;
  completedBy?: "kitchen" | "auto";
};

export const toKitchenOrder = (o: Order): KitchenOrder => ({
  ...o,
  createdMs: o.createdAt ? o.createdAt.toMillis() : null,
  completedMs: o.completedAt ? o.completedAt.toMillis() : null,
  completedBy: o.completedBy ?? undefined,
});

/**
 * The kitchen screen: « En préparation » (oldest first, each with « Terminé »)
 * and « Terminées » (today's last 20, newest first). An order leaves the first
 * zone when someone taps « Terminé » (written to Firestore) or when its own
 * prep duration runs out (derived from createdAt, nothing written).
 */
export function KitchenScreen({ uid }: { uid: string }) {
  const { offsetMs, synced } = useServerClockOffset(uid);
  const localNow = useTick(1000);
  const serverNow = localNow + offsetMs;
  const today = dayKey(new Date(serverNow));
  const online = useOnline();

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [listError, setListError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
  const [completeError, setCompleteError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const offsetRef = useRef(offsetMs);
  useEffect(() => {
    offsetRef.current = offsetMs;
  }, [offsetMs]);
  const sound = useKitchenSound();
  const playRef = useRef(sound.play);
  useEffect(() => {
    playRef.current = sound.play;
  }, [sound.play]);
  const prompt = useSoundPrompt(sound);

  // Keep the screen awake where the browser allows it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Not allowed here (battery saver, old browser): the screen may sleep.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Today's and yesterday's orders (an order made just before midnight can
  // still be in preparation). Equality on one field: no composite index.
  // Re-subscribes when the shop day changes.
  useEffect(() => {
    const q = query(collection(db, "orders"), where("day", "in", [previousDay(today), today]));
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setListError(false);
        const next = snap.docs.map((d) => toKitchenOrder(toOrder(d)));
        setOrders(next);
        // Not for the initial load, not for orders already on screen (lib/kitchen.ts).
        const { seen: nextSeen, fresh } = detectArrivals(seen.current, next, Date.now() + offsetRef.current);
        seen.current = nextSeen;
        if (fresh.length > 0) {
          const at = Date.now();
          setArrivals((cur) => ({ ...cur, ...Object.fromEntries(fresh.map((o) => [o.id, at])) }));
          playRef.current();
        }
      },
      () => {
        setListError(true);
        retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      },
    );
    return () => {
      clearTimeout(retry);
      unsubscribe();
    };
  }, [today, attempt]);

  // « Terminé »: only the three completion fields, as the rules require.
  // Firestore applies it locally at once, so the card moves immediately
  // (offline too: the write is sent when the connection comes back).
  async function complete(orderId: string) {
    setCompleteError(null);
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: "completed",
        completedAt: serverTimestamp(),
        completedBy: "kitchen",
      });
    } catch (error) {
      setCompleteError(errorMessage(error, tk.completeError, t.common.permissionDenied));
    }
  }

  return (
    <KitchenBoard
      orders={orders}
      today={today}
      serverNow={serverNow}
      localNow={localNow}
      arrivals={arrivals}
      online={online}
      listError={listError}
      synced={synced}
      sound={sound.state}
      showSoundPrompt={prompt.show}
      onActivateSound={prompt.activate}
      onComplete={complete}
      completeError={completeError}
    />
  );
}

interface BoardProps {
  orders: KitchenOrder[];
  /** Shop day, YYYY-MM-DD: « Terminées » shows this day only. */
  today: string;
  /** Server-adjusted now, ms. */
  serverNow: number;
  /** Local now, ms (arrival flashes are timed locally). */
  localNow: number;
  /** Local time each order was first seen arriving live. */
  arrivals: Record<string, number>;
  online: boolean;
  listError: boolean;
  synced: boolean;
  sound: SoundState;
  /** The one-time start screen that unlocks audio. */
  showSoundPrompt: boolean;
  onActivateSound: () => void;
  onComplete: (orderId: string) => void;
  completeError: string | null;
}

/** What the kitchen sees, from data alone (no listeners here). */
export function KitchenBoard({
  orders,
  today,
  serverNow,
  localNow,
  arrivals,
  online,
  listError,
  synced,
  sound,
  showSoundPrompt,
  onActivateSound,
  onComplete,
  completeError,
}: BoardProps) {
  // Dark theme for the whole document while this screen is up.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "kitchen";
    return () => {
      delete root.dataset.theme;
    };
  }, []);

  const { preparing, completed } = splitZones(orders, serverNow, today);

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <h1 className={styles.title}>{tk.title}</h1>
        <p className={`${styles.count} num`} aria-live="polite">
          {tk.preparingCount(preparing.length)}
        </p>
        {sound !== "running" && !showSoundPrompt && (
          <p className={styles.soundOff} role="status">
            {sound === "unsupported" ? tk.soundUnsupported : tk.soundOff}
          </p>
        )}
        <p className={`${styles.clock} num`}>{formatTime(new Date(serverNow))}</p>
        <LogoutButton />
      </header>

      {(!online || listError || !synced) && (
        <p className={styles.status} role="status" data-tone={!online || listError ? "error" : "info"}>
          {!online ? tk.connectionLost : listError ? tk.listError : tk.clockSyncing}
        </p>
      )}
      {completeError && (
        <p className={styles.status} role="alert" data-tone="error">
          {completeError}
        </p>
      )}

      <div className={styles.zones}>
        <section className={styles.zone} aria-labelledby="zone-preparing">
          <h2 id="zone-preparing" className={styles.zoneTitle}>
            {tk.preparingTitle}
            <span className={`${styles.zoneCount} num`}>{preparing.length}</span>
          </h2>
          <div className={styles.zoneBody}>
          {preparing.length === 0 ? (
            <div className={styles.waiting}>
              <p className={styles.waitingTitle}>{tk.waitingTitle}</p>
              <p className={styles.waitingText}>{tk.waiting}</p>
            </div>
          ) : (
            <ol className={styles.board}>
              {preparing.map((o) => {
                const timing = cardTiming(o.createdMs!, serverNow, prepMsOf(o));
                const arrived = arrivals[o.id];
                const isNew = arrived !== undefined && localNow - arrived < FLASH_MS;
                const label = formatOrderNumber(o.number);
                return (
                  <li
                    key={o.id}
                    className={styles.card}
                    data-new={isNew || undefined}
                    data-last-minute={timing.lastMinute || undefined}
                  >
                    <div className={styles.cardHead}>
                      <span className={`${styles.number} num`}>{label}</span>
                      <span className={styles.timing}>
                        {isNew && <span className={styles.newTag}>{tk.newOrder}</span>}
                        <span className="num">{tk.elapsed(timing.elapsed.m, timing.elapsed.s)}</span>
                      </span>
                    </div>

                    <ul className={styles.items}>
                      {o.items.map((item, i) => (
                        <li key={i} className={styles.item}>
                          <span className={`${styles.qty} num`}>{item.qty}</span>
                          <bdi className={styles.name}>{item.name}</bdi>
                          <span className={styles.sauce} data-none={item.sauces.length === 0 || undefined}>
                            {item.sauces.length > 0 ? item.sauces.join(" + ") : tk.noSauce}
                          </span>
                          {item.note && (
                            <span className={styles.note}>
                              {t.ticket.note} : <bdi>{item.note}</bdi>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className={styles.progress}>
                      <div className={styles.track} aria-hidden="true">
                        <div className={styles.fill} style={{ transform: `scaleX(${timing.fraction})` }} />
                      </div>
                      <span className={`${styles.remaining} num`}>
                        {timing.lastMinute ? `${tk.lastMinute}, ` : ""}
                        {tk.remaining(timing.remaining.m, timing.remaining.s)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={`btn btn-primary ${styles.done}`}
                      onClick={() => onComplete(o.id)}
                      aria-label={tk.completeAria(label)}
                    >
                      {tk.complete}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          </div>
        </section>

        <section className={`${styles.zone} ${styles.zoneDone}`} aria-labelledby="zone-completed">
          <h2 id="zone-completed" className={styles.zoneTitle}>
            {tk.completedTitle}
            <span className={`${styles.zoneCount} num`}>{completed.length}</span>
          </h2>
          <div className={styles.zoneBody}>
          {completed.length === 0 ? (
            <p className={styles.doneEmpty}>{tk.completedEmpty}</p>
          ) : (
            <ol className={styles.doneList}>
              {completed.map((o) => (
                <li key={o.id} className={styles.doneCard}>
                  <div className={styles.doneHead}>
                    <span className={`${styles.doneNumber} num`}>{formatOrderNumber(o.number)}</span>
                    <span className={styles.doneBy} data-by={o.doneBy}>
                      {o.doneBy === "auto" ? tk.byAuto : tk.byManual}
                    </span>
                  </div>
                  <p className={`${styles.doneAt} num`}>{tk.completedAt(formatTime(new Date(o.doneMs)))}</p>
                  <ul className={styles.doneItems}>
                    {o.items.map((item, i) => (
                      <li key={i}>
                        <span className="num">{item.qty} ×</span> <bdi>{item.name}</bdi>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          </div>
        </section>
      </div>

      {showSoundPrompt && (
        <div className={styles.prompt} role="dialog" aria-modal="true" aria-labelledby="sound-prompt-title">
          <div className={styles.promptBox}>
            <h2 id="sound-prompt-title" className={styles.promptTitle}>
              {tk.soundPromptTitle}
            </h2>
            <p className={styles.promptText}>{tk.soundPromptText}</p>
            <button type="button" className={`btn btn-primary ${styles.promptButton}`} onClick={onActivateSound}>
              {tk.soundActivate}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
