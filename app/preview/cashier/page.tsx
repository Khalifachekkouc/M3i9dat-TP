"use client";

import { useState } from "react";
import { CashierScreen } from "@/app/cashier/CashierScreen";
import { cartReducer, saveCart, type CartLine } from "@/lib/cart";
import { ClientOnly, PreviewProvider, previewProducts } from "../fixtures";

/** A cart in every line state: sauce chosen, waiting for sauce, drink, with a note. */
function sampleCart(): CartLine[] {
  const [combo, , , , duo] = previewProducts;
  const drink = previewProducts.find((p) => p.sauceOptions.length === 0)!;
  let lines: CartLine[] = [];
  lines = cartReducer(lines, { type: "add", product: combo, sauceChoices: combo.sauceOptions });
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Tomate" });
  lines = cartReducer(lines, { type: "toggleSauce", key: lines[0].key, sauce: "Piquante" });
  lines = cartReducer(lines, { type: "add", product: duo, sauceChoices: duo.sauceOptions });
  lines = cartReducer(lines, { type: "add", product: drink, sauceChoices: [] });
  lines = cartReducer(lines, { type: "inc", key: lines[2].key });
  return lines;
}

function Screen() {
  // Seed the cart before the screen reads it from storage.
  useState(() => {
    saveCart(sampleCart());
    return true;
  });
  return (
    <PreviewProvider>
      <CashierScreen uid="preview" email={null} role="cashier" />
    </PreviewProvider>
  );
}

export default function CashierPreview() {
  return (
    <ClientOnly>
      <Screen />
    </ClientOnly>
  );
}
