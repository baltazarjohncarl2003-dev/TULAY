import { notFound } from "next/navigation";
import { PageHeader, Row, StatusPill } from "@/components/common";
import { ClaimThread } from "@/components/claim-thread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { claimSettings, getClaim } from "@/lib/data/claims";
import { signedOrderFileUrls } from "@/lib/data/orders";
import { date, php } from "@/lib/format";
import { BuyerClaimActions } from "./buyer-claim-actions";

export const metadata = { title: "Claim details" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reads the clock; call only after the page's data awaits. */
function olderThanDays(iso: string, days: number) {
  return Date.now() - Date.parse(iso) > days * DAY_MS;
}

export default async function BuyerClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [claim, viewer, settings] = await Promise.all([getClaim(id), getSessionUser(), claimSettings()]);
  if (!claim || !viewer || claim.buyerId !== viewer.id) notFound();

  const fileUrls = await signedOrderFileUrls(claim.evidence.map((e) => e.storagePath));
  const canEscalate = claim.status === "rejected" || (claim.status === "open" && olderThanDays(claim.createdAt, settings.responseDays));

  return (
    <>
      <PageHeader
        eyebrow={`${claim.orderRef} · ${claim.supplierName}`}
        title={claim.ref}
        actions={<StatusPill status={claim.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>What happened</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p className="whitespace-pre-wrap">{claim.description}</p>

              {claim.evidence.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">Photos and videos</h3>
                  <ul className="flex flex-col gap-1">
                    {claim.evidence.map((e) => {
                      const url = fileUrls[e.storagePath];
                      return (
                        <li key={e.storagePath}>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                              {e.fileName}
                            </a>
                          ) : (
                            <span>{e.fileName}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {claim.responseNote && (
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">Supplier&apos;s response</h3>
                  <p className="whitespace-pre-wrap">{claim.responseNote}</p>
                </div>
              )}

              {claim.decisionNote && (
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">TULAY&apos;s decision</h3>
                  <p className="whitespace-pre-wrap">{claim.decisionNote}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(claim.remedy || claim.returnRequired) && (
            <Card>
              <CardHeader>
                <CardTitle>Outcome</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {claim.remedy === "refund" && (
                  <>
                    <Row k="Agreed refund" v={php(claim.refundCentavos)} />
                    {claim.restockingFeeCentavos > 0 && <Row k="Restocking fee" v={php(claim.restockingFeeCentavos)} />}
                    {claim.onlineRefund && (
                      <Row
                        k="Refunded to your payment method"
                        v={
                          <span className="inline-flex items-center gap-2">
                            {php(claim.onlineRefund.amountCentavos)}
                            <StatusPill status={claim.onlineRefund.status} />
                          </span>
                        }
                      />
                    )}
                    <Row k="Paid back directly by the supplier" v={php(claim.manualRefundCentavos)} />
                    {claim.manualRefundRef && <p>Reference: {claim.manualRefundRef}</p>}
                    {claim.status === "refund_pending" && <p className="text-muted-foreground">Waiting for the supplier&apos;s transfer</p>}
                  </>
                )}

                {claim.remedy === "replacement" && (
                  <p>
                    {claim.status === "resolved" ? "The supplier sent a replacement." : "The supplier will send a replacement."}
                  </p>
                )}

                {claim.returnRequired && (
                  <>
                    <Row k="RA number" v={claim.raNumber} />
                    <Row
                      k="Return shipping"
                      v={
                        claim.returnPayer === "buyer"
                          ? "You pay return shipping"
                          : claim.returnPayer === "supplier"
                            ? "The supplier pays and books the return"
                            : null
                      }
                    />
                    <p>
                      Return the item to: {claim.supplierName}. Write the RA number on the parcel. The supplier&apos;s exact
                      return address comes in the messages below.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimThread
                claimId={claim.id}
                messages={claim.messages}
                viewerId={viewer.id}
                names={{ [viewer.id]: viewer.fullName, [claim.supplierOwnerId]: claim.supplierName }}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <BuyerClaimActions claim={claim} canEscalate={canEscalate} />

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {claim.history.length ? (
                <ol className="flex flex-col gap-3 text-sm">
                  {claim.history.map((h, i) => (
                    <li key={`${h.createdAt}-${i}`} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <StatusPill status={h.toStatus} />
                        <span className="text-xs text-muted-foreground">{date(h.createdAt)}</span>
                      </div>
                      {h.note && <p className="text-muted-foreground">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No updates yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
