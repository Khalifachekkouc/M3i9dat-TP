"use client";

import { useState } from "react";
import { TicketsDialog } from "@/app/cashier/TicketsDialog";
import { ClientOnly, previewPlacedOrder } from "../fixtures";

function Dialog() {
  const [order] = useState(previewPlacedOrder);
  const [open, setOpen] = useState(true);
  return open ? <TicketsDialog order={order} onClose={() => setOpen(false)} /> : null;
}

export default function TicketsPreview() {
  return (
    <ClientOnly>
      <Dialog />
    </ClientOnly>
  );
}
