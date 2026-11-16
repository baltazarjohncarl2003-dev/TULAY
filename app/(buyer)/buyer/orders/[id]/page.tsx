import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { claimsForOrder, claimSettings, reviewForOrder } from "@/lib/data/claims";
import { getOrder, payUrlFor, rfqForSelection, signedOrderFileUrls } from "@/lib/data/orders";
import { getNumberSettings } from "@/lib/data/settings";
import { date, label, sentence, php, qty } from "@/lib/format";
import { COURIERS, carrierLabel, type CarrierId } from "@/lib/shipping/couriers";
import type { ClaimStatus, ClaimType, OrderStatus } from "@/lib/types";
import { ArtworkUpload } from "./artwork-upload";
import { CancelOrder } from "./cancel-order";
import { ConfirmDelivery } from "./confirm-delivery";
import { ProofReview } from "./proof-review";
import { ReportProblem } from "./report-problem";
import { ReviewForm } from "./review-form";
import { CopyTrackingNumber, TrackingTimeline } from "./tracking-timeline";

export const metadata = { title: "Order Details" };

const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  damage: "Damaged, wrong or missing",
  return: "Change of mind return",
  defect: "Print defect",
};
const FINAL_CLAIM: ClaimStatus[] = ["resolved", "declined", "cancelled"];
const HOUR_MS = 60 * 60 * 1000;

/** Reads the clock; call only after the page's data awaits. */
function notPast(iso: string) {
  return Date.now() <= Date.parse(iso);
}

/** "confirmed" means cash on delivery; say so instead of the bare status word. */
function OrderStatusPill({ status }: { status: OrderStatus }) {
  if (status !== "confirmed") return <StatusPill status={status} />;
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      Confirmed (cash on delivery)
    </span>
  );
}

function FileLink({ url, name }: { url: string | undefined; name: string }) {
  if (!url) return <span>{name}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
      {name}
    </a>
  );
}

export default async function BuyerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, viewer] = await Promise.all([getOrder(id), getSessionUser()]);
  if (!order || order.buyerId !== viewer?.id) notFound();

  // Mirrors cancel_order: paid or COD-confirmed, no approved proof, custom orders only within the admin window after payment.
  const cancellable = (order.status === "paid" || order.status === "confirmed") && !order.proofApprovedAt;
  const needsWindow = cancellable && order.custom && order.paidAt !== null;
  const [fileUrls, rfq, cancelSettings] = await Promise.all([
    signedOrderFileUrls([...order.artwork.map((a) => a.storagePath), ...order.proofs.map((p) => p.storagePath)]),
    order.selectionId ? rfqForSelection(order.selectionId) : null,
    needsWindow ? getNumberSettings(["custom_cancel_window_hours"]) : null,
  ]);
  const cancelDeadline =
    cancelSettings && order.paidAt
      ? new Date(Date.parse(order.paidAt) + cancelSettings.custom_cancel_window_hours * HOUR_MS).toISOString()
      : null;
  const canCancel = cancellable && (!cancelDeadline || notPast(cancelDeadline));
  const refundCentavos =
    order.paidOnlineCentavos - order.refunds.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amountCentavos, 0);
  const payUrl = payUrlFor(order);
  const canUpload = (order.status === "paid" || order.status === "confirmed") && !order.proofApprovedAt;
  const latestProof = order.proofs.at(-1);
  const awaitingDelivery = order.status === "shipped" && (order.fulfilmentMode !== "courier" || order.shipment?.manual === true);
  const courierSite = order.shipment ? (COURIERS[order.shipment.carrier as CarrierId]?.site ?? null) : null;
  const address = order.shipTo;

  const postDelivery = order.status === "delivered" || order.status === "completed";
  const loaded = postDelivery
    ? await Promise.all([claimsForOrder(order.id), claimSettings(), reviewForOrder(order.id)])
    : null;
  const claims = loaded?.[0] ?? [];
  const settings = loaded?.[1] ?? null;
  const review = loaded?.[2] ?? null;
  const hasOpenClaim = claims.some((c) => !FINAL_CLAIM.includes(c.status));
  const stars = review ? "★".repeat(review.rating) + "☆".repeat(5 - review.rating) : "";

  return (
    <>
      <PageHeader
        eyebrow={order.supplierName}
        title={order.ref}
        description={
          rfq ? (
            <>
              From RFQ{" "}
              <Link href={`/buyer/rfqs/${rfq.id}`} className="text-primary underline underline-offset-2">
                {rfq.ref}
              </Link>
            </>
          ) : undefined
        }
        actions={<OrderStatusPill status={order.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{item.title}</span>
                      {item.variantName && <span className="text-muted-foreground">{item.variantName}</span>}
                      <span className="text-muted-foreground">
                        {qty(item.quantity)} {label(item.unit)} × {php(item.unitPriceCentavos)}
                      </span>
                    </div>
                    <strong className="tabular-nums">{php(item.lineTotalCentavos)}</strong>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-col divide-y border-t pt-2">
                <Row k="Items subtotal" v={php(order.itemsCentavos)} />
                {order.feesCentavos > 0 && <Row k="Quoted fees (setup, shipping, tax)" v={php(order.feesCentavos)} />}
                {order.shippingCentavos > 0 && <Row k="Courier fee" v={php(order.shippingCentavos)} />}
                <Row k="Total" v={php(order.totalCentavos)} />
              </div>
            </CardContent>
          </Card>

          {order.custom && (
            <Card>
              <CardHeader>
                <CardTitle>Artwork and proof</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6 text-sm">
                {order.proofApprovedAt && (
                  <Notice>Proof approved — production can start. This proof is kept as the agreed design.</Notice>
                )}

                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">Artwork</h3>
                  {order.artwork.length === 0 && <p className="text-muted-foreground">No artwork uploaded yet.</p>}
                  <ul className="flex flex-col divide-y">
                    {order.artwork.map((a) => (
                      <li key={a.id} className="flex flex-col gap-0.5 py-2">
                        <FileLink url={fileUrls[a.storagePath]} name={a.fileName} />
                        <span className="text-xs text-muted-foreground">{date(a.createdAt)}</span>
                        {a.note && <span className="text-muted-foreground">{a.note}</span>}
                      </li>
                    ))}
                  </ul>
                  {canUpload && <ArtworkUpload orderId={order.id} />}
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">Proofs</h3>
                  {order.proofs.length === 0 && <p className="text-muted-foreground">No proof sent yet.</p>}
                  <ul className="flex flex-col divide-y">
                    {order.proofs.map((p) => (
                      <li key={p.id} className="flex flex-col gap-1 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">Version {p.version}</span>
                          <StatusPill status={p.status} />
                        </div>
                        <FileLink url={fileUrls[p.storagePath]} name={`Proof version ${p.version}`} />
                        {p.note && <span className="text-muted-foreground">{p.note}</span>}
                        {p.responseNote && <span className="text-muted-foreground">Your response: {p.responseNote}</span>}
                      </li>
                    ))}
                  </ul>
                  {latestProof?.status === "sent" && <ProofReview proofId={latestProof.id} />}
                </section>
              </CardContent>
            </Card>
          )}

          {(order.shipment || order.fulfilmentMode === "courier") && (
            <Card>
              <CardHeader>
                <CardTitle>Tracking</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {order.shipment ? (
                  <>
                    {order.shipment.status === "failed_attempt" && (
                      <Notice tone="warn">
                        The courier could not deliver. They usually try again; make sure someone can receive the parcel, or
                        message the supplier.
                      </Notice>
                    )}
                    {order.shipment.status === "returned" && (
                      <Notice tone="warn">
                        The parcel went back to the supplier. The order shows as cancelled; any refund is listed under Refunds.
                      </Notice>
                    )}
                    <Row k="Carrier" v={carrierLabel(order.shipment.carrier, order.shipment.carrierName)} />
                    <Row k="Tracking ref" v={order.shipment.trackingRef} />
                    <Row k="Status" v={<StatusPill status={order.shipment.status} />} />
                    {courierSite && (
                      <div className="flex flex-col gap-2">
                        <p>
                          Enter tracking number <strong>{order.shipment.trackingRef}</strong> on the courier&apos;s site.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <a
                            href={courierSite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            Track on {carrierLabel(order.shipment.carrier, order.shipment.carrierName)}&apos;s site
                          </a>
                          <CopyTrackingNumber value={order.shipment.trackingRef} />
                        </div>
                      </div>
                    )}
                    <TrackingTimeline status={order.shipment.status} events={order.shipment.events} />
                    <ol className="flex flex-col gap-3 border-t pt-3">
                      {order.shipment.events.map((e, i) => (
                        <li key={`${e.occurredAt}-${i}`} className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between gap-2">
                            {sentence(e.status)}
                            <span className="text-xs text-muted-foreground">{date(e.occurredAt)}</span>
                          </div>
                          {e.note && <span className="text-muted-foreground">{e.note}</span>}
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="text-muted-foreground">The supplier will book the courier after production.</p>
                )}
              </CardContent>
            </Card>
          )}

          {order.refunds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y text-sm">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1 py-2">
                      <div className="flex items-center justify-between gap-4">
                        <strong className="tabular-nums">{php(r.amountCentavos)}</strong>
                        <StatusPill status={r.status} />
                      </div>
                      {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                      <span className="text-xs text-muted-foreground">{date(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {postDelivery && settings && (
            <Card>
              <CardHeader>
                <CardTitle>Problems with this order</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                {claims.length === 0 && <p className="text-muted-foreground">No problems reported.</p>}
                {claims.length > 0 && (
                  <ul className="flex flex-col divide-y">
                    {claims.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <Link href={`/buyer/claims/${c.id}`} className="font-medium text-primary underline underline-offset-2">
                            {c.ref}
                          </Link>
                          <span className="text-muted-foreground">{CLAIM_TYPE_LABEL[c.type]}</span>
                        </div>
                        <StatusPill status={c.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {!hasOpenClaim && (
                  <ReportProblem orderId={order.id} items={order.items} deliveredAt={order.deliveredAt} settings={settings} />
                )}
              </CardContent>
            </Card>
          )}

          {postDelivery && (
            <Card>
              <CardHeader>
                <CardTitle>Your review</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {review ? (
                  <>
                    {review.hidden && <Notice tone="warn">Hidden by TULAY: {review.hiddenReason}</Notice>}
                    <span className="text-lg text-primary">{stars}</span>
                    {review.body && <p>{review.body}</p>}
                    {review.supplierReply && (
                      <p className="text-muted-foreground">Supplier reply: {review.supplierReply}</p>
                    )}
                  </>
                ) : (
                  <ReviewForm orderId={order.id} />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {(order.paymentOption === "cod" || payUrl) && (
            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {order.paymentOption === "cod" && (
                  <div className="flex flex-col divide-y">
                    <Row k="Paid online" v={php(order.paidOnlineCentavos)} />
                    <Row k="Due on delivery" v={php(order.totalCentavos - order.paidOnlineCentavos)} />
                  </div>
                )}
                {payUrl && (
                  <Link href={payUrl} className={buttonVariants()}>
                    Pay now
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Row k="Method" v={sentence(order.fulfilmentMode)} />
              {order.fulfilmentMode === "buyer_pickup" ? (
                <span>Pickup at the supplier</span>
              ) : (
                address && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{address.recipient}</span>
                    <span>{address.phone}</span>
                    <span>
                      {[address.line1, address.line2, address.barangay, address.city, address.province, address.postalCode]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </div>
                )
              )}
              {awaitingDelivery && order.deliveryClaimedAt && (
                <Notice>
                  The supplier says this was delivered. Confirm, or it is confirmed automatically in a few days.
                </Notice>
              )}
              {awaitingDelivery && !order.deliveryClaimedAt && order.fulfilmentMode === "buyer_pickup" && (
                <Notice>Ready for pickup at the supplier. Confirm once you have the goods.</Notice>
              )}
              {awaitingDelivery && <ConfirmDelivery orderId={order.id} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3 text-sm">
                {order.history.map((h, i) => (
                  <li key={`${h.createdAt}-${i}`} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <OrderStatusPill status={h.toStatus} />
                      <span className="text-xs text-muted-foreground">{date(h.createdAt)}</span>
                    </div>
                    {h.reason && <span className="text-muted-foreground">{h.reason}</span>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {canCancel && <CancelOrder orderId={order.id} refundCentavos={Math.max(refundCentavos, 0)} deadline={cancelDeadline} />}
        </div>
      </div>
    </>
  );
}
