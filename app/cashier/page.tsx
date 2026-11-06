"use client";

import { RoleGate } from "@/components/RoleGate";
import { CashierScreen } from "./CashierScreen";

export default function CashierPage() {
  return (
    <RoleGate allow={["cashier", "admin"]}>
      {({ user, profile }) => <CashierScreen uid={user.uid} email={user.email} role={profile.role} />}
    </RoleGate>
  );
}
