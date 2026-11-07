"use client";

import { RoleGate } from "@/components/RoleGate";
import { KitchenScreen } from "./KitchenScreen";

export default function KitchenPage() {
  return (
    <RoleGate allow={["kitchen", "admin"]}>
      {({ user }) => <KitchenScreen uid={user.uid} />}
    </RoleGate>
  );
}
