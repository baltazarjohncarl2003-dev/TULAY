import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { canAdmin, requireRole } from "@/lib/auth";
import { parseListParams } from "@/lib/data/admin-money";
import { listSuppliers } from "@/lib/data/catalog";
import { loadDeals } from "@/lib/data/deals";
import { qty } from "@/lib/format";
import { NeedsRole } from "../orders/list-controls";
import { StatusTabs } from "../suppliers/status-tabs";
import { RfqQueueActions } from "./rfq-queue-actions";

export const metadata = { title: "RFQ review queue" };

const STATUSES = ["under_review", "needs_information", "matching", "invited", "quoting", "supplier_selected", "cancelled"] as const;
const TABS = [{ value: "", label: "All" }, ...STATUSES.map((value) => ({ value, label: value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }))];

export default async function AdminRfqsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp, deals, suppliers] = await Promise.all([requireRole("admin"), searchParams, loadDeals(), listSuppliers()]);
  const params = parseListParams(sp, STATUSES);
  const q = params.q.toLowerCase();
  // Waiting-for-review first, then newest. Drafts stay with the buyer until they submit.
  // shortcut: filtered in memory from the loaded deals; move to a database query with paging when RFQs pass ~1,000.
  const rfqs = deals.rfqs
    .filter((r) => r.status !== "draft" && (!params.status || r.status === params.status))
    .filter((r) => !q || `${r.ref} ${r.product}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.status === "under_review") - Number(a.status === "under_review") || b.createdAt.localeCompare(a.createdAt));
  const can = canAdmin(user, "support");

  return (
    <>
      <PageHeader
        eyebrow="Sourcing operations"
        title="RFQ review queue"
        description="Review requests, approve matching and invite approved suppliers."
      />

      {!can && <NeedsRole role="support" />}
      <StatusTabs tabs={TABS} status={params.status} q={params.q} placeholder="RFQ number or product" />

      {rfqs.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No requests match." : !can ? "Nothing to show." : "No requests yet."} />
      ) : (
        <div className="flex flex-col gap-4">
          {rfqs.map((r) => {
            const invitedSupplierIds = deals.invites.filter((i) => i.rfqId === r.id).map((i) => i.supplierId);
            return (
              <Card key={r.id}>
                <CardHeader>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">{r.ref}</p>
                    <CardTitle>{r.product}</CardTitle>
                  </div>
                  <CardAction>
                    <StatusPill status={r.status} />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <p>
                    {qty(r.quantity)} {r.unit} · {r.city}, {r.province}
                  </p>
                  <p>Supplier invites: {invitedSupplierIds.length}</p>
                </CardContent>
                <CardFooter className="flex-wrap gap-2">
                  <RfqQueueActions
                    rfqId={r.id}
                    status={r.status}
                    invitedSupplierIds={invitedSupplierIds}
                    suppliers={suppliers}
                    can={can}
                  />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
