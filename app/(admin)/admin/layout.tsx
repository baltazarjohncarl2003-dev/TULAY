import { Suspense } from "react";
import { RoleGuard, WorkspaceFallback } from "@/components/role-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <RoleGuard role="admin">{children}</RoleGuard>
    </Suspense>
  );
}
