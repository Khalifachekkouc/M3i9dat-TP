"use client";

import { RoleGate } from "@/components/RoleGate";
import { KitchenScreen } from "./KitchenScreen";

export default function KitchenPage() {
  return (
    <RoleGate allow={["kitchen", "admin"]} noControls>
      {({ user }) => <KitchenScreen uid={user.uid} />}
    </RoleGate>
  );
}
