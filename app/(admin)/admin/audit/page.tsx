import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listAuditLog, parseAuditFilters, type AuditFilters } from "@/lib/data/admin";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit Log" };

// Admin page for a target, where one exists.
function targetHref(table: string, id: string): string | null {
  if (table === "orders") return `/admin/orders/${id}`;
  if (table === "claims") return `/admin/claims/${id}`;
  if (table === "profiles") return `/admin/users?q=${id}`;
  return null;
}

function pageHref(f: AuditFilters, page: number) {
  const sp = new URLSearchParams();
  for (const k of ["action", "target", "actor", "from", "to"] as const) if (f[k]) sp.set(k, f[k]);
  if (page > 1) sp.set("page", String(page));
  return `?${sp.toString()}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const f = parseAuditFilters(await searchParams);
  const result = await listAuditLog(f);
  const filtered = Boolean(f.action || f.target || f.actor || f.from || f.to);
  return (
    <>
      <PageHeader
        eyebrow="Trust operations"
        title="Audit Log"
        description="Who changed what, newest first. Filter by action, target id, actor or date (Philippine time)."
      />

      <form method="get" role="search" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input name="action" defaultValue={f.action} placeholder="Action, e.g. refund" aria-label="Action contains" maxLength={40} />
        <Input name="target" defaultValue={f.target} placeholder="Target id (order, user...)" aria-label="Target id" maxLength={60} />
        <Input name="actor" defaultValue={f.actor} placeholder="Actor name or email" aria-label="Actor name or email" maxLength={80} />
        <Input name="from" type="date" defaultValue={f.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={f.to} aria-label="To date" />
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Filter
          </Button>
          {filtered && (
            <Link href="?" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState title={filtered ? "No entries match." : "No entries to show."}>
          {!filtered && "Only super admins can read the audit log."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((r) => {
                const href = targetHref(r.targetTable, r.targetId);
                const target = `${r.targetTable} · ${r.targetId.slice(0, 8)}`;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{dateTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <code>{r.action}</code>
                    </TableCell>
                    <TableCell>
                      {href ? (
                        <Link href={href} className="text-primary hover:underline">
                          {target}
                        </Link>
                      ) : (
                        target
                      )}{" "}
                      <Link href={`?target=${encodeURIComponent(r.targetId)}`} className="text-xs text-muted-foreground hover:underline">
                        (all actions)
                      </Link>
                    </TableCell>
                    <TableCell>{r.actorId ? (r.actorName ?? r.actorId.slice(0, 8)) : "system"}</TableCell>
                    <TableCell>
                      <code className="text-xs break-all">{JSON.stringify(r.details)}</code>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {result.total.toLocaleString("en-PH")} {result.total === 1 ? "entry" : "entries"} · page {result.page} of {result.pages}
        </span>
        <span className="flex gap-2">
          {result.page > 1 && (
            <Link href={pageHref(f, result.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          )}
          {result.page < result.pages && (
            <Link href={pageHref(f, result.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          )}
        </span>
      </nav>
    </>
  );
}
