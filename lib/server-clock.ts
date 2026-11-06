"use client";

import { useEffect, useState } from "react";
import { doc, getDocFromServer, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";

const RESYNC_MS = 10 * 60 * 1000;
const RETRY_MS = 30 * 1000;
const MAX_ROUND_TRIP_MS = 5000;

/**
 * Measures how far this device's clock is from Firestore's clock.
 * Writes serverTimestamp() to clock/{uid}, reads back the stored server time,
 * and takes the middle of the write's round trip as the moment it was stamped.
 * serverNow = Date.now() + offsetMs. Error is at most half a round trip.
 */
export function useServerClockOffset(uid: string): { offsetMs: number; synced: boolean } {
  const [state, setState] = useState({ offsetMs: 0, synced: false });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ref = doc(db, "clock", uid);

    async function sync() {
      try {
        const sent = Date.now();
        await setDoc(ref, { t: serverTimestamp() });
        const acked = Date.now();
        // Offline, the write waits for the network: a long round trip says
        // nothing about when the server stamped it, so measure again.
        if (acked - sent > MAX_ROUND_TRIP_MS) throw new Error("round trip too long");
        const snap = await getDocFromServer(ref);
        const server = (snap.get("t") as Timestamp | undefined)?.toMillis();
        if (!cancelled && server !== undefined) {
          setState({ offsetMs: server - (sent + acked) / 2, synced: true });
        }
        if (!cancelled) timer = setTimeout(sync, RESYNC_MS);
      } catch {
        // Offline or denied: keep the last known offset and try again soon.
        if (!cancelled) timer = setTimeout(sync, RETRY_MS);
      }
    }

    void sync();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uid]);

  return state;
}

/** Re-renders every `intervalMs` with the current local time. */
export function useTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
