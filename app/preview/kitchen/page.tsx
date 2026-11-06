"use client";

import { useState } from "react";
import { KitchenBoard, type KitchenOrder } from "@/app/kitchen/KitchenScreen";
import { useTick } from "@/lib/server-clock";
import { useKitchenSound, useSoundPrompt } from "@/lib/kitchen-sound";
import { ClientOnly, previewOrders } from "../fixtures";

function Board() {
  const [{ orders, arrivals }] = useState(() => {
    const now = Date.now();
    const base: KitchenOrder[] = previewOrders(now).map((o) => ({ ...o, createdMs: o.createdAt!.toMillis() }));
    // ?n=12 fills the board with more live orders, to check that it shrinks to fit.
    const n = Number(new URLSearchParams(window.location.search).get("n")) || 0;
    const live = base.filter((o) => now - o.createdMs! < 5 * 60_000);
    const extra = Array.from({ length: Math.max(0, n - live.length) }, (_, i) => {
      const src = live[i % live.length];
      const number = base.length + i + 1;
      return { ...src, id: `${src.day}-${number}`, number, createdMs: now - 4 * 60_000 + i * 15_000 };
    });
    const list = [...base, ...extra];
    // The newest one has "just arrived": it flashes.
    return { orders: list, arrivals: { [list.at(-1)!.id]: now } };
  });
  const now = useTick(1000);
  // ?sound=prompt shows the start screen, ?sound=locked the header indicator,
  // ?sound=real runs the real audio hooks.
  const [sound] = useState(() => new URLSearchParams(window.location.search).get("sound"));
  const [prompt, setPrompt] = useState(sound === "prompt");
  const real = useKitchenSound();
  const realPrompt = useSoundPrompt(real);
  if (sound === "real") {
    return (
      <KitchenBoard
        orders={orders}
        serverNow={now}
        localNow={now}
        arrivals={arrivals}
        online
        listError={false}
        synced
        sound={real.state}
        showSoundPrompt={realPrompt.show}
        onActivateSound={realPrompt.activate}
      />
    );
  }
  return (
    <KitchenBoard
      orders={orders}
      serverNow={now}
      localNow={now}
      arrivals={arrivals}
      online
      listError={false}
      synced
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
