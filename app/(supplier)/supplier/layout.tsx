import { WorkspaceShell } from "@/components/workspace-shell";

// TODO(Stage 1): guard with Supabase Auth + role check; today anyone can open the demo.
export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell role="supplier">{children}</WorkspaceShell>;
}
