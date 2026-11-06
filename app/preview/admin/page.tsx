"use client";

import { AdminView } from "@/app/admin/AdminView";
import { ClientOnly, PreviewProvider } from "../fixtures";

export default function AdminPreview() {
  return (
    <ClientOnly>
      <PreviewProvider>
        <AdminView role="admin" email={null} />
      </PreviewProvider>
    </ClientOnly>
  );
}
