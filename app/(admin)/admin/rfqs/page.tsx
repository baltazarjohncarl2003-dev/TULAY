import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { INVITES, RFQS } from "@/lib/demo/data";
import { qty } from "@/lib/format";
import { RfqQueueActions } from "./rfq-queue-actions";

export const metadata = { title: "RFQ review queue" };

// Newest first. Drafts stay with the buyer until they submit.
const rfqs = RFQS.filter((r) => r.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export default function AdminRfqsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sourcing operations"
        title="RFQ review queue"
        description="Review requests, approve matching and invite approved suppliers."
      />

      {rfqs.length === 0 ? (
        <EmptyState title="No requests yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {rfqs.map((r) => {
            const invitedSupplierIds = INVITES.filter((i) => i.rfqId === r.id).map((i) => i.supplierId);
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
                  <RfqQueueActions rfqId={r.id} status={r.status} invitedSupplierIds={invitedSupplierIds} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
