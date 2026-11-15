import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { USER_TABS, listAdminUsers } from "@/lib/data/admin";
import { parseListParams } from "@/lib/data/admin-money";
import { date, label } from "@/lib/format";
import { NeedsRole, Pager } from "../orders/list-controls";
import { StatusTabs } from "../suppliers/status-tabs";
import { UserActions } from "./user-actions";

export const metadata = { title: "Users" };

const TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const header = (
    <PageHeader
      eyebrow="Trust operations"
      title="Users"
      description="Find an account by email, name or business, suspend or reactivate it, and manage admin roles. Every change is logged."
    />
  );
  if (!canAdmin(user, "support")) {
    return (
      <>
        {header}
        <NeedsRole role="support" />
      </>
    );
  }
  const params = parseListParams(await searchParams, USER_TABS);
  const result = await listAdminUsers(params);
  const canManageRoles = canAdmin(user, "super_admin");
  return (
    <>
      {header}
      <StatusTabs tabs={TABS} status={params.status} q={params.q} placeholder="Email, name, business or account id" />

      {result.rows.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No accounts match." : "No accounts yet."} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <strong className="font-medium">{u.fullName || "(no name)"}</strong>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {label(u.role)}
                    {u.subRoles.length > 0 && <span className="block text-xs text-muted-foreground">{u.subRoles.map(label).join(", ")}</span>}
                  </TableCell>
                  <TableCell>{u.businesses.join(", ") || "—"}</TableCell>
                  <TableCell>
                    <StatusPill status={u.status} />
                  </TableCell>
                  <TableCell>{date(u.createdAt)}</TableCell>
                  <TableCell>
                    {u.id === user.id ? (
                      <span className="text-xs text-muted-foreground">This is you</span>
                    ) : (
                      <UserActions
                        userId={u.id}
                        name={u.fullName || u.email}
                        status={u.status}
                        isAdmin={u.role === "admin"}
                        subRoles={u.subRoles}
                        canManageRoles={canManageRoles}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={result} params={params} />
    </>
  );
}
