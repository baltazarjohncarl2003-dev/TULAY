import { WorkspaceShell } from "@/components/workspace-shell";
import { requireRole, type UserRole } from "@/lib/auth";

/** Checks the session and role, then renders the workspace. Must sit inside a <Suspense> (reads cookies). */
export async function RoleGuard({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const user = await requireRole(role);
  return (
    <WorkspaceShell role={role} userName={user.fullName || user.email}>
      {children}
    </WorkspaceShell>
  );
}

export function WorkspaceFallback() {
  return <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Loading your workspace…</div>;
}
