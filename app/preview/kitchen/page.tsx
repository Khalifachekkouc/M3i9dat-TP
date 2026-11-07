"use client";

import { useState } from "react";
import { KitchenBoard, toKitchenOrder, type KitchenOrder } from "@/app/kitchen/KitchenScreen";
import { dayKey } from "@/lib/i18n";
import { useTick } from "@/lib/server-clock";
import { useKitchenSound, useSoundPrompt } from "@/lib/kitchen-sound";
import { ClientOnly, previewOrders } from "../fixtures";

function Board() {
  const [initial] = useState(() => {
    const now = Date.now();
    const base: KitchenOrder[] = previewOrders(now).map(toKitchenOrder);
    // ?n=12 adds more live orders (each zone scrolls on its own).
    const n = Number(new URLSearchParams(window.location.search).get("n")) || 0;
    const live = base.filter((o) => o.status === "preparing" && now - o.createdMs! < 4 * 60_000);
    const extra = Array.from({ length: Math.max(0, n - live.length) }, (_, i) => {
      const src = live[i % live.length];
      const number = base.length + i + 1;
      return { ...src, id: `${src.day}-${number}`, number, createdMs: now - 4 * 60_000 + i * 15_000 };
    });
    const list = [...base, ...extra];
    // The newest one has "just arrived": it flashes.
    return { orders: list, arrivals: { [list.at(-1)!.id]: now } };
  });
  const [orders, setOrders] = useState(initial.orders);
  const now = useTick(1000);
  // « Terminé » in the preview: the same fields the real screen writes, kept locally.
  const complete = (id: string) =>
    setOrders((list) =>
      list.map((o) => (o.id === id ? { ...o, status: "completed", completedMs: Date.now(), completedBy: "kitchen" } : o)),
    );
  // ?sound=prompt shows the start screen, ?sound=locked the header indicator,
  // ?sound=real runs the real audio hooks.
  const [sound] = useState(() => new URLSearchParams(window.location.search).get("sound"));
  const [prompt, setPrompt] = useState(sound === "prompt");
  const real = useKitchenSound();
  const realPrompt = useSoundPrompt(real);
  const common = {
    orders,
    today: dayKey(new Date(now)),
    serverNow: now,
    localNow: now,
    arrivals: initial.arrivals,
    online: true,
    listError: false,
    synced: true,
    onComplete: complete,
    completeError: null,
  };
  if (sound === "real") {
    return (
      <KitchenBoard {...common} sound={real.state} showSoundPrompt={realPrompt.show} onActivateSound={realPrompt.activate} />
    );
  }
  return (
    <KitchenBoard
      {...common}
      sound={sound === "prompt" || sound === "locked" ? "locked" : "running"}
      showSoundPrompt={prompt}
      onActivateSound={() => setPrompt(false)}
    />
  );
}

export default function KitchenPreview() {
  return (
    <ClientOnly>
      <Board />
    </ClientOnly>
  );
}
