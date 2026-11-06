"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * running: sound plays. locked: the browser waits for a tap or a key press
 * (autoplay policy). unsupported: no Web Audio in this browser.
 */
export type SoundState = "running" | "locked" | "unsupported";

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null;
}

/**
 * The arrival signal: a two-note "ding-dong" played twice (about 0.9 s),
 * triangle wave with a quieter square an octave up so it carries over a
 * grill and an extractor fan, through a compressor so it is loud without
 * clipping. Generated here: no audio file to load or cache.
 */
function playChime(ctx: AudioContext, volume = 0.9) {
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -12;
  out.ratio.value = 6;
  out.connect(ctx.destination);

  const notes: [number, number][] = [
    [0, 1318.5], // E6
    [0.2, 987.8], // B5
    [0.48, 1318.5],
    [0.68, 987.8],
  ];
  const t0 = ctx.currentTime + 0.02;
  for (const [at, freq] of notes) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.19);
    gain.connect(out);

    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = freq;
    body.connect(gain);

    const edge = ctx.createOscillator();
    const edgeGain = ctx.createGain();
    edge.type = "square";
    edge.frequency.value = freq * 2;
    edgeGain.gain.value = 0.12;
    edge.connect(edgeGain).connect(gain);

    for (const osc of [body, edge]) {
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.2);
    }
  }
}

export function useKitchenSound(): { state: SoundState; unlock: () => void; play: () => void } {
  const ctxRef = useRef<AudioContext | null>(null);
  const [state, setState] = useState<SoundState>(() => (audioCtor() ? "locked" : "unsupported"));

  useEffect(() => {
    const Ctx = audioCtor();
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    const sync = () => setState(ctx.state === "running" ? "running" : "locked");
    ctx.addEventListener("statechange", sync);
    // Allowed without a gesture only where autoplay is permitted
    // (Chrome --autoplay-policy=no-user-gesture-required, or a kiosk policy).
    ctx.resume().then(sync, sync);
    return () => {
      ctx.removeEventListener("statechange", sync);
      ctxRef.current = null;
      void ctx.close().catch(() => undefined);
    };
  }, []);

  /** Must run inside a click or key handler: that is what the browser accepts as consent. */
  const unlock = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "running") return;
    ctx.resume().then(
      () => {
        if (ctx.state === "running") playChime(ctx, 0.5); // a quieter confirmation that it works
      },
      () => undefined,
    );
  }, []);

  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "running") {
      try {
        playChime(ctx);
      } catch {
        // Audio device gone: the visual flash still shows.
      }
    }
  }, []);

  // While locked, the first tap or key press anywhere unlocks the sound.
  useEffect(() => {
    if (state !== "locked") return;
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [state, unlock]);

  return { state, unlock, play };
}

const PROMPT_KEY = "m3i9dat.kitchen.soundPrompted";

/**
 * The one-time "Activer le son" start screen: shown while audio is locked,
 * once per browser session (after a refresh the header indicator and a tap
 * anywhere take over). A click on its button or any key press dismisses it.
 */
export function useSoundPrompt(sound: { state: SoundState; unlock: () => void }) {
  const [prompted, setPrompted] = useState(() => {
    try {
      return sessionStorage.getItem(PROMPT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const show = sound.state === "locked" && !prompted;
  const { unlock } = sound;

  const activate = useCallback(() => {
    unlock();
    setPrompted(true);
    try {
      sessionStorage.setItem(PROMPT_KEY, "1");
    } catch {
      // No storage: the prompt may show again after a refresh.
    }
  }, [unlock]);

  useEffect(() => {
    if (!show) return;
    window.addEventListener("keydown", activate);
    return () => window.removeEventListener("keydown", activate);
  }, [show, activate]);

  return { show, activate };
}
