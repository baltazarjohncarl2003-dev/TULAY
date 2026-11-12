import { notFound } from "next/navigation";
import { PageHeader, Row, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrder, signedOrderFileUrls } from "@/lib/data/orders";
import { date, label, php, qty } from "@/lib/format";
import { FulfilmentActions } from "./fulfilment-actions";
import { ProofUpload } from "./proof-upload";

export const metadata = { title: "Order details" };

export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  // Buyer contact stays on the server; the client component gets the order without it.
  const { buyer, ...orderForClient } = order;
  const refunded = order.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountCentavos, 0);
  const receive = order.totalCentavos - order.commissionCentavos - order.gatewayFeeCentavos - refunded;
  const urls = await signedOrderFileUrls([...order.artwork.map((a) => a.storagePath), ...order.proofs.map((p) => p.storagePath)]);
  const latestProof = order.proofs.at(-1);
  const canSendProof =
    (order.status === "paid" || order.status === "confirmed") && !order.proofApprovedAt && latestProof?.status !== "sent";
  const addressLine = order.shipTo
    ? [order.shipTo.recipient, order.shipTo.phone, order.shipTo.line1, order.shipTo.line2, order.shipTo.barangay, order.shipTo.city, order.shipTo.province, order.shipTo.postalCode]
        .filter(Boolean)
        .join(", ")
    : "Buyer picks up";

  return (
    <>
      <PageHeader
        eyebrow="Order"
        title={order.ref}
        description={`Paid ${date(order.paidAt)}`}
        actions={<StatusPill status={order.status} />}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Buyer</h2>
          {buyer ? (
            <>
              <Row k="Name" v={buyer.name} />
              <Row k="Business" v={buyer.businessName} />
              <Row k="Email" v={buyer.email} />
              <Row k="Phone" v={buyer.phone} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Buyer details are not available.</p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Totals</h2>
          <Row k="Order total" v={php(order.totalCentavos)} />
          <Row
            k="TULAY commission"
            v={order.commissionCentavos === 0 ? "0% during testing" : php(order.commissionCentavos)}
          />
          <Row k="Payment gateway fee (paid by you)" v={php(order.gatewayFeeCentavos)} />
          <Row k="Refunds" v={php(refunded)} />
          <div className="mt-2 border-t pt-2">
            <Row k="You receive" v={php(receive)} />
          </div>
        </section>
      </div>

      <section className="mb-6 rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">Delivery</h2>
        <Row k="Mode" v={label(order.fulfilmentMode)} />
        <Row k="Deliver to" v={addressLine} />
        {order.paymentOption === "cod" && (
          <>
            <Row k="Collect on delivery" v={php(order.totalCentavos - order.paidOnlineCentavos)} />
            <p className="text-xs text-muted-foreground">The courier collects this and remits it to you.</p>
          </>
        )}
        <div className="mt-4">
          <FulfilmentActions order={orderForClient} />
        </div>
      </section>

      {order.custom && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Artwork and proofs</h2>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold">Artwork</h3>
              {order.artwork.length ? (
                <ul className="flex flex-col divide-y text-sm">
                  {order.artwork.map((a) => (
                    <li key={a.id} className="flex flex-col gap-0.5 py-2">
                      {urls[a.storagePath] ? (
                        <a href={urls[a.storagePath]} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
                          {a.fileName}
                        </a>
                      ) : (
                        <span className="font-medium">{a.fileName}</span>
                      )}
                      {a.note && <span className="text-muted-foreground">{a.note}</span>}
                      <span className="text-xs text-muted-foreground">{date(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">The buyer has not uploaded artwork yet.</p>
              )}
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold">Proofs</h3>
              {order.proofs.length ? (
                <ul className="flex flex-col divide-y text-sm">
                  {order.proofs.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>Proof v{p.version}</strong>
                        <StatusPill status={p.status} />
                        <span className="text-xs text-muted-foreground">{date(p.createdAt)}</span>
                      </div>
                      {urls[p.storagePath] && (
                        <a href={urls[p.storagePath]} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          Open proof
                        </a>
                      )}
                      {p.note && <span>Your note: {p.note}</span>}
                      {p.responseNote && <span className="text-muted-foreground">Buyer response: {p.responseNote}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No proof sent yet.</p>
              )}
              <div className="mt-4">
                {canSendProof ? (
                  <ProofUpload orderId={order.id} />
                ) : order.proofApprovedAt ? (
                  <p className="text-sm">Proof approved</p>
                ) : latestProof?.status === "sent" ? (
                  <p className="text-sm">Waiting for the buyer to review proof v{latestProof.version}</p>
                ) : null}
              </div>
            </section>
          </div>
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold">Items</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Option</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit price</TableHead>
              <TableHead>Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.title}</TableCell>
                <TableCell>{i.variantName || "—"}</TableCell>
                <TableCell>
                  {qty(i.quantity)} {i.unit}
                </TableCell>
                <TableCell>{php(i.unitPriceCentavos)}</TableCell>
                <TableCell>{php(i.lineTotalCentavos)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {order.shipment && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Tracking</h2>
          <div className="mb-4 flex flex-col divide-y rounded-lg border bg-card px-4 text-sm">
            <Row k="Carrier" v={order.shipment.carrier} />
            <Row k="Tracking ref" v={order.shipment.trackingRef} />
            <Row k="Status" v={<StatusPill status={order.shipment.status} />} />
          </div>
          {order.shipment.events.length ? (
            <ol className="mb-6 flex flex-col gap-3">
              {order.shipment.events.map((e, i) => (
                <li key={`${e.occurredAt}-${i}`} className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={e.status} />
                    <span className="text-muted-foreground">{date(e.occurredAt)}</span>
                  </div>
                  {e.note && <p className="text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mb-6 text-sm text-muted-foreground">No tracking updates yet.</p>
          )}
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold">Status</h2>
      {order.history.length ? (
        <ol className="flex flex-col gap-3">
          {order.history.map((h, i) => (
            <li key={`${h.createdAt}-${i}`} className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={h.toStatus} />
                <span className="text-muted-foreground">{date(h.createdAt)}</span>
              </div>
              {h.reason && <p className="text-muted-foreground">{h.reason}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No status changes yet.</p>
      )}
    </>
  );
}
