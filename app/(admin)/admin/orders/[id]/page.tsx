import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Row, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { claimsForOrder } from "@/lib/data/claims";
import { getOrder, signedOrderFileUrls } from "@/lib/data/orders";
import { dateTime, label, php, qty } from "@/lib/format";
import { NeedsRole } from "../list-controls";

export const metadata = { title: "Order Details" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole("admin");
  if (!canAdmin(user, "finance", "support")) {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Order" />
        <NeedsRole role="finance or support" />
      </>
    );
  }
  const order = await getOrder(id);
  if (!order) notFound();

  const [urls, claims] = await Promise.all([
    signedOrderFileUrls([...order.artwork.map((a) => a.storagePath), ...order.proofs.map((p) => p.storagePath)]),
    claimsForOrder(order.id),
  ]);
  const refunded = order.refunds.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amountCentavos, 0);
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
        description={`${order.supplierName} · placed ${dateTime(order.createdAt)}`}
        actions={
          <>
            <StatusPill status={order.status} />
            <Link href="/admin/orders" className="text-sm text-primary hover:underline">
              Back to orders
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Buyer</h2>
          {order.buyer ? (
            <>
              <Row k="Name" v={order.buyer.name} />
              <Row k="Business" v={order.buyer.businessName} />
              <Row k="Email" v={order.buyer.email} />
              <Row k="Phone" v={order.buyer.phone} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Buyer details are not available.</p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Totals</h2>
          <Row k="Items" v={php(order.itemsCentavos)} />
          <Row k="Delivery" v={php(order.shippingCentavos)} />
          <Row k="Order total" v={php(order.totalCentavos)} />
          <Row k="Commission" v={php(order.commissionCentavos)} />
          <Row k="Gateway fee" v={php(order.gatewayFeeCentavos)} />
          <Row k="Paid online" v={php(order.paidOnlineCentavos)} />
          <Row k="Refunded" v={php(refunded)} />
          {order.paymentOption === "cod" && <Row k="Collected on delivery" v={php(order.totalCentavos - order.paidOnlineCentavos)} />}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Payment and refunds</h2>
          <Row k="Option" v={order.paymentOption === "cod" ? "Cash on delivery" : "Online"} />
          <Row k="Method" v={order.payment ? label(order.payment.method) : null} />
          <Row k="Payment status" v={order.payment ? <StatusPill status={order.payment.status} /> : "Not paid"} />
          <Row k="Gateway ref" v={order.payment?.providerRef ?? null} />
          {order.refunds.length > 0 && (
            <ul className="mt-2 flex flex-col divide-y text-sm">
              {order.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {php(r.amountCentavos)} <StatusPill status={r.status} />
                  </span>
                  <span className="text-muted-foreground">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {claims.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {claims.map((c) => (
                <Link key={c.id} href={`/admin/claims/${c.id}`} className="text-primary hover:underline">
                  Claim {c.ref} ({label(c.status)})
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Delivery</h2>
          <Row k="Mode" v={label(order.fulfilmentMode)} />
          <Row k="Deliver to" v={addressLine} />
          {order.shipment ? (
            <>
              <Row k="Carrier" v={order.shipment.carrier} />
              <Row k="Tracking ref" v={order.shipment.trackingRef} />
              <Row k="Shipment status" v={<StatusPill status={order.shipment.status} />} />
              <h3 className="mt-3 text-sm font-medium">Tracking events</h3>
              {order.shipment.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tracking events yet.</p>
              ) : (
                <ol className="flex flex-col gap-2 text-sm">
                  {order.shipment.events.map((e) => (
                    <li key={`${e.occurredAt}-${e.status}`} className="flex flex-col gap-0.5 border-l-2 pl-3">
                      <span className="font-medium">
                        {label(e.status)} · <span className="text-muted-foreground">{dateTime(e.occurredAt)}</span>
                      </span>
                      {e.note && <span className="text-muted-foreground">{e.note}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No shipment booked yet.</p>
          )}
        </section>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Items</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit price</TableHead>
              <TableHead>Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  {i.title}
                  {i.variantName && <span className="text-muted-foreground"> · {i.variantName}</span>}
                </TableCell>
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

      {order.custom && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 font-semibold">Artwork</h2>
            {order.artwork.length === 0 ? (
              <p className="text-sm text-muted-foreground">No artwork uploaded.</p>
            ) : (
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
                    <span className="text-xs text-muted-foreground">{dateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 font-semibold">Proofs</h2>
            {order.proofApprovedAt && <p className="mb-2 text-sm">Approved {dateTime(order.proofApprovedAt)}</p>}
            {order.proofs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No proof sent yet.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {order.proofs.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>Proof v{p.version}</strong>
                      <StatusPill status={p.status} />
                      <span className="text-xs text-muted-foreground">{dateTime(p.createdAt)}</span>
                    </div>
                    {urls[p.storagePath] && (
                      <a href={urls[p.storagePath]} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        Open proof
                      </a>
                    )}
                    {p.note && <span>Supplier note: {p.note}</span>}
                    {p.responseNote && <span className="text-muted-foreground">Buyer response: {p.responseNote}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">Status history</h2>
        {order.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {order.history.map((h) => (
              <li key={`${h.createdAt}-${h.toStatus}`} className="flex flex-col gap-0.5 border-l-2 pl-3">
                <span className="font-medium">
                  {label(h.toStatus)} · <span className="text-muted-foreground">{dateTime(h.createdAt)}</span>
                </span>
                {h.reason && <span className="text-muted-foreground">{h.reason}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
