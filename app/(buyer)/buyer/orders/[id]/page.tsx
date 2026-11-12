import { notFound } from "next/navigation";
import { Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { getOrder, signedOrderFileUrls } from "@/lib/data/orders";
import { date, label, php, qty } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { ArtworkUpload } from "./artwork-upload";
import { CancelOrder } from "./cancel-order";
import { ConfirmDelivery } from "./confirm-delivery";
import { ProofReview } from "./proof-review";

export const metadata = { title: "Order details" };

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

  const fileUrls = await signedOrderFileUrls([
    ...order.artwork.map((a) => a.storagePath),
    ...order.proofs.map((p) => p.storagePath),
  ]);
  const canUpload = (order.status === "paid" || order.status === "confirmed") && !order.proofApprovedAt;
  const latestProof = order.proofs.at(-1);
  const awaitingDelivery = order.status === "shipped" && order.fulfilmentMode !== "courier";
  const address = order.shipTo;

  return (
    <>
      <PageHeader
        eyebrow={order.supplierName}
        title={order.ref}
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
                    <Row k="Carrier" v={order.shipment.carrier} />
                    <Row k="Tracking ref" v={order.shipment.trackingRef} />
                    <Row k="Status" v={<StatusPill status={order.shipment.status} />} />
                    <ol className="flex flex-col gap-3 border-t pt-3">
                      {order.shipment.events.map((e, i) => (
                        <li key={`${e.occurredAt}-${i}`} className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="capitalize">{label(e.status)}</span>
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
        </div>

        <div className="flex flex-col gap-6">
          {(order.paymentOption === "cod" || order.shippingCentavos > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {order.shippingCentavos > 0 && <Row k="Courier fee" v={php(order.shippingCentavos)} />}
                {order.paymentOption === "cod" && (
                  <>
                    <Row k="Paid online" v={php(order.paidOnlineCentavos)} />
                    <Row k="Due on delivery" v={php(order.totalCentavos - order.paidOnlineCentavos)} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Row k="Method" v={<span className="capitalize">{label(order.fulfilmentMode)}</span>} />
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
                <>
                  <Notice>
                    The supplier says this was delivered. Confirm, or it is confirmed automatically in a few days.
                  </Notice>
                  <ConfirmDelivery orderId={order.id} />
                </>
              )}
              {awaitingDelivery && !order.deliveryClaimedAt && order.fulfilmentMode === "buyer_pickup" && (
                <Notice>Ready for pickup at the supplier.</Notice>
              )}
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

          {order.status === "paid" && <CancelOrder orderId={order.id} />}
        </div>
      </div>
    </>
  );
}
