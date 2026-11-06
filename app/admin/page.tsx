"use client";

import { RoleGate } from "@/components/RoleGate";
import { AdminView } from "./AdminView";

export default function AdminPage() {
  return (
    <RoleGate allow={["admin"]}>{({ user, profile }) => <AdminView role={profile.role} email={user.email} />}</RoleGate>
  );
}
