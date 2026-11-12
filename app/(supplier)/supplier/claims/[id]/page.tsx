import { notFound, redirect } from "next/navigation";
import { PageHeader, Row, StatusPill } from "@/components/common";
import { ClaimThread } from "@/components/claim-thread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { getClaim } from "@/lib/data/claims";
import { getOrder, signedOrderFileUrls } from "@/lib/data/orders";
import { date, label, php } from "@/lib/format";
import { SupplierClaimActions } from "./supplier-claim-actions";

export const metadata = { title: "Claim details" };

export default async function SupplierClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const claim = await getClaim(id);
  if (!claim) notFound();

  const [order, fileUrls] = await Promise.all([
    getOrder(claim.orderId),
    signedOrderFileUrls(claim.evidence.map((e) => e.storagePath)),
  ]);
  const items = order?.items.filter((i) => claim.itemIds.includes(i.id)) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Claim"
        title={claim.ref}
        description={`Order ${claim.orderRef} · opened ${date(claim.createdAt)}`}
        actions={<StatusPill status={claim.status} />}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Claim</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            <Row k="Type" v={<span className="capitalize">{label(claim.type)}</span>} />
            <Row k="Items" v={claim.itemIds.length === 0 ? "Whole order" : items.map((i) => i.title).join(", ") || `${claim.itemIds.length} item(s)`} />
            <Row k="Item must come back" v={claim.returnRequired ? "Yes" : "No"} />
            {claim.returnPayer && <Row k="Return paid by" v={<span className="capitalize">{claim.returnPayer}</span>} />}
            {claim.raNumber && <Row k="RA number" v={claim.raNumber} />}
            {claim.returnTrackingRef && <Row k="Return tracking" v={claim.returnTrackingRef} />}
            {claim.returnReceivedAt && <Row k="Item received" v={date(claim.returnReceivedAt)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Description from the buyer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm whitespace-pre-wrap">{claim.description}</p>
            {claim.evidence.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {claim.evidence.map((e) =>
                  fileUrls[e.storagePath] ? (
                    <li key={e.storagePath}>
                      <a
                        href={fileUrls[e.storagePath]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {e.fileName}
                      </a>
                    </li>
                  ) : (
                    <li key={e.storagePath}>{e.fileName}</li>
                  ),
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No files attached.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mb-6 rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">Outcome</h2>
        <Row k="Remedy" v={claim.remedy ? <span className="capitalize">{label(claim.remedy)}</span> : "Not decided"} />
        {claim.remedy === "refund" && <Row k="Agreed refund" v={php(claim.refundCentavos)} />}
        {claim.restockingFeeCentavos > 0 && <Row k="Restocking fee" v={php(claim.restockingFeeCentavos)} />}
        {claim.onlineRefund && (
          <Row
            k="Refunded online"
            v={
              <span className="inline-flex items-center gap-2">
                {php(claim.onlineRefund.amountCentavos)} <StatusPill status={claim.onlineRefund.status} />
              </span>
            }
          />
        )}
        {claim.manualRefundCentavos > 0 && (
          <>
            <Row k="Paid back directly" v={php(claim.manualRefundCentavos)} />
            {claim.manualRefundRef && <Row k="Reference" v={claim.manualRefundRef} />}
          </>
        )}
        {claim.responseNote && <Row k="Your response" v={claim.responseNote} />}
        {claim.decisionNote && <Row k="TULAY decision" v={claim.decisionNote} />}
        {claim.resolvedAt && <Row k="Resolved" v={date(claim.resolvedAt)} />}
      </section>

      <section className="mb-6 rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">History</h2>
        {claim.history.length ? (
          <ol className="flex flex-col gap-3">
            {claim.history.map((h, i) => (
              <li key={`${h.createdAt}-${i}`} className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={h.toStatus} />
                  <span className="text-muted-foreground">{date(h.createdAt)}</span>
                </div>
                {h.note && <p className="text-muted-foreground">{h.note}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No status changes yet.</p>
        )}
      </section>

      <div className="mb-6">
        <SupplierClaimActions claim={claim} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Messages</h2>
      <ClaimThread
        claimId={claim.id}
        messages={claim.messages}
        viewerId={user.id}
        names={{ [claim.buyerId]: "Buyer", [claim.supplierOwnerId]: claim.supplierName }}
      />
    </>
  );
}
