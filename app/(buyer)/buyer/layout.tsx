import { Suspense } from "react";
import { RoleGuard, WorkspaceFallback } from "@/components/role-guard";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <RoleGuard role="buyer">{children}</RoleGuard>
    </Suspense>
  );
}
