import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { canAdmin, requireRole } from "@/lib/auth";
import { parseListParams } from "@/lib/data/admin-money";
import { listSuppliers } from "@/lib/data/catalog";
import { loadDealPage } from "@/lib/data/deals";
import { qty } from "@/lib/format";
import { NeedsRole, Pager } from "../orders/list-controls";
import { StatusTabs } from "../suppliers/status-tabs";
import { RfqQueueActions } from "./rfq-queue-actions";

export const metadata = { title: "RFQ Review Queue" };

const STATUSES = ["under_review", "needs_information", "matching", "invited", "quoting", "supplier_selected", "cancelled"] as const;
const TABS = [{ value: "", label: "All" }, ...STATUSES.map((value) => ({ value, label: value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }))];

export default async function AdminRfqsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp, suppliers] = await Promise.all([requireRole("admin"), searchParams, listSuppliers()]);
  const params = parseListParams(sp, STATUSES);
  // The database filters (no drafts, status, ref/product) and puts the review queue first.
  const { deals, paged } = await loadDealPage("admin_rfqs", params);
  const rfqs = paged.rows.flatMap((id) => deals.rfqs.find((r) => r.id === id) ?? []);
  const can = canAdmin(user, "support");

  return (
    <>
      <PageHeader
        eyebrow="Sourcing operations"
        title="RFQ Review Queue"
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
      <Pager data={paged} params={params} />
    </>
  );
}
