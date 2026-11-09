import { Suspense } from "react";
import { RoleGuard, WorkspaceFallback } from "@/components/role-guard";

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <RoleGuard role="supplier">{children}</RoleGuard>
    </Suspense>
  );
}
