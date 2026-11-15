import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { CLAIM_STATUSES, listAdminClaims, parseListParams, type AdminClaimRow } from "@/lib/data/admin-money";
import { claimSettings } from "@/lib/data/claims";
import { date, label } from "@/lib/format";
import { ListFilters, NeedsRole, Pager } from "../orders/list-controls";

export const metadata = { title: "Claims" };

const DAY_MS = 24 * 60 * 60 * 1000;

// Within the page: escalated first, then open claims past the supplier's answer window, then the rest.
// The server order (newest first) stays inside each group.
function sortClaims(claims: AdminClaimRow[], responseDays: number): AdminClaimRow[] {
  const staleBefore = Date.now() - responseDays * DAY_MS;
  const rank = (c: AdminClaimRow) => {
    if (c.status === "escalated") return 0;
    if (c.status === "open" && Date.parse(c.createdAt) < staleBefore) return 1;
    return 2;
  };
  return [...claims].sort((a, b) => rank(a) - rank(b));
}

export default async function AdminClaimsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const header = (
    <PageHeader
      eyebrow="After-sales"
      title="Claims"
      description="Every claim on TULAY. Escalated claims wait for a TULAY decision and show first."
    />
  );
  if (!canAdmin(user, "finance", "support")) {
    return (
      <>
        {header}
        <NeedsRole role="support or finance" />
      </>
    );
  }

  const params = parseListParams(await searchParams, CLAIM_STATUSES);
  const [claims, settings] = await Promise.all([listAdminClaims(params), claimSettings()]);
  const sorted = sortClaims(claims.rows, settings.responseDays);

  return (
    <>
      {header}

      {claims.escalated > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {claims.escalated} {claims.escalated === 1 ? "claim is" : "claims are"} waiting for a TULAY decision.{" "}
            <Link href="?status=escalated" className="underline">
              Show them
            </Link>
          </Notice>
        </div>
      )}

      <ListFilters params={params} statuses={CLAIM_STATUSES} placeholder="Claim ref or order ref" />

      {sorted.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No claims match." : "No claims yet."} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/claims/${c.id}`} className="font-medium underline underline-offset-2">
                      {c.ref}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.order ? (
                      <Link href={`/admin/orders/${c.order.id}`} className="text-primary hover:underline">
                        {c.order.ref}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{c.supplierName}</TableCell>
                  <TableCell>{label(c.type)}</TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell>{date(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={claims} params={params} />
    </>
  );
}
