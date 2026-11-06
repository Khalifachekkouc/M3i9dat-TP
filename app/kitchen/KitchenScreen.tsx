"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toOrder, useOnline } from "@/lib/data";
import { formatTime, t } from "@/lib/i18n";
import { cardTiming, detectArrivals, queryCutoffMs, visibleOrders } from "@/lib/kitchen";
import { useKitchenSound, useSoundPrompt, type SoundState } from "@/lib/kitchen-sound";
import { useServerClockOffset, useTick } from "@/lib/server-clock";
import type { Order } from "@/lib/types";
import styles from "./kitchen.module.css";

const tk = t.kitchen;
const FLASH_MS = 6000;
const RETRY_MS = 5000;
const DENSITIES = ["large", "medium", "compact", "tiny"] as const;

export type KitchenOrder = Order & { createdMs: number | null };

/**
 * The kitchen wall screen. Nothing to touch in normal use: orders arrive by
 * themselves and leave by themselves 5 minutes after createdAt. The only
 * control is the one-time "Activer le son" start screen (browsers block audio
 * until someone taps or presses a key).
 */
export function KitchenScreen({ uid }: { uid: string }) {
  const { offsetMs, synced } = useServerClockOffset(uid);
  const localNow = useTick(1000);
  const serverNow = localNow + offsetMs;
  const online = useOnline();

  const cutoff = queryCutoffMs(serverNow);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [listError, setListError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
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

  // Live orders since the cutoff. The cutoff moves once a minute, which
  // re-subscribes; the exact 5-minute filter runs on every tick below.
  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      where("createdAt", ">=", Timestamp.fromMillis(cutoff)),
      orderBy("createdAt", "asc"),
    );
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setListError(false);
        const next = snap.docs.map((d) => {
          const o = toOrder(d);
          return { ...o, createdMs: o.createdAt ? o.createdAt.toMillis() : null };
        });
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
  }, [cutoff, attempt]);

  return (
    <KitchenBoard
      orders={orders}
      serverNow={serverNow}
      localNow={localNow}
      arrivals={arrivals}
      online={online}
      listError={listError}
      synced={synced}
      sound={sound.state}
      showSoundPrompt={prompt.show}
      onActivateSound={prompt.activate}
    />
  );
}

interface BoardProps {
  orders: KitchenOrder[];
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
}

/** What the wall shows, from data alone: no listeners, no controls. */
export function KitchenBoard({
  orders,
  serverNow,
  localNow,
  arrivals,
  online,
  listError,
  synced,
  sound,
  showSoundPrompt,
  onActivateSound,
}: BoardProps) {
  // Dark theme for the whole document while this screen is up.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "kitchen";
    return () => {
      delete root.dataset.theme;
    };
  }, []);

  const shown = visibleOrders(orders, serverNow);
  const ids = shown.map((o) => o.id).join(",");

  // Nobody can scroll this screen, so the board shrinks until every card fits.
  // Start from a size picked by the count, then step down while it overflows.
  // The steps belong to one set of orders on one screen size; either change starts over.
  const base = shown.length <= 4 ? 0 : shown.length <= 8 ? 1 : 2;
  const screenRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState("");
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setBox(`${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const key = `${ids}|${box}`;
  const [fit, setFit] = useState<{ key: string; steps: number; hidden: number }>({ key: "", steps: 0, hidden: 0 });
  const steps = fit.key === key ? fit.steps : 0;
  const hidden = fit.key === key ? fit.hidden : 0;
  const level = Math.min(DENSITIES.length - 1, base + steps);
  const boardRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const bottom = board.getBoundingClientRect().bottom;
    const cut = [...board.children].filter((card) => card.getBoundingClientRect().bottom > bottom + 1).length;
    // Measuring the laid-out board is the point of this effect.
    if (cut > 0 && level < DENSITIES.length - 1) setFit({ key, steps: steps + 1, hidden: 0 });
    else if (cut !== hidden || fit.key !== key) setFit({ key, steps, hidden: cut });
  }, [key, level, steps, hidden, fit.key]);

  return (
    <div ref={screenRef} className={styles.screen} data-density={DENSITIES[level]}>
      <header className={styles.head}>
        <h1 className={styles.title}>{tk.title}</h1>
        <p className={`${styles.count} num`} aria-live="polite">
          {shown.length > 0 ? tk.ordersCount(shown.length) : ""}
        </p>
        {hidden > 0 && (
          <p className={styles.hidden} role="status">
            {tk.offScreen(hidden)}
          </p>
        )}
        {sound !== "running" && !showSoundPrompt && (
          <p className={styles.soundOff} role="status">
            {sound === "unsupported" ? tk.soundUnsupported : tk.soundOff}
          </p>
        )}
        <p className={`${styles.clock} num`}>{formatTime(new Date(serverNow))}</p>
      </header>

      {showSoundPrompt && (
        <div className={styles.prompt} role="dialog" aria-modal="true" aria-labelledby="sound-prompt-title">
          <div className={styles.promptBox}>
            <h2 id="sound-prompt-title" className={styles.promptTitle}>
              {tk.soundPromptTitle}
            </h2>
            <p className={styles.promptText}>{tk.soundPromptText}</p>
            {/* The one control of this screen, for startup only. */}
            <button
              type="button"
              className={`btn btn-primary ${styles.promptButton}`}
              onClick={onActivateSound}
              autoFocus
            >
              {tk.soundActivate}
            </button>
          </div>
        </div>
      )}

      {(!online || listError || !synced) && (
        <p className={styles.status} role="status" data-tone={!online || listError ? "error" : "info"}>
          {!online ? tk.connectionLost : listError ? tk.listError : tk.clockSyncing}
        </p>
      )}

      {shown.length === 0 ? (
        <div className={styles.waiting}>
          <p className={styles.waitingTitle}>{tk.waitingTitle}</p>
          <p className={styles.waitingText}>{tk.waiting}</p>
        </div>
      ) : (
        <ol ref={boardRef} className={styles.board} aria-label={tk.title}>
          {shown.map((o) => {
            const timing = cardTiming(o.createdMs!, serverNow);
            const arrived = arrivals[o.id];
            const isNew = arrived !== undefined && localNow - arrived < FLASH_MS;
            return (
              <li
                key={o.id}
                className={styles.card}
                data-new={isNew || undefined}
                data-last-minute={timing.lastMinute || undefined}
              >
                <div className={styles.cardHead}>
                  <span className={`${styles.number} num`}>{o.number}</span>
                  <span className={styles.timing}>
                    {isNew && <span className={styles.newTag}>{tk.newOrder}</span>}
                    <span className="num">{tk.elapsed(timing.elapsed.m, timing.elapsed.s)}</span>
                  </span>
                </div>

                <ul className={styles.items}>
                  {o.items.map((item, i) => (
                    <li key={i} className={styles.item}>
                      <span className={`${styles.qty} num`}>{item.qty}</span>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.sauce} data-none={item.sauces.length === 0 || undefined}>
                        {item.sauces.length > 0 ? item.sauces.join(" + ") : tk.noSauce}
                      </span>
                      {item.note && <span className={styles.note}>{item.note}</span>}
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
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
