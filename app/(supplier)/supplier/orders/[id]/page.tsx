import { notFound } from "next/navigation";
import { PageHeader, Row, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrder } from "@/lib/data/orders";
import { date, php, qty } from "@/lib/format";

export const metadata = { title: "Order details" };

export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const { buyer } = order;
  const refunded = order.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountCentavos, 0);
  const receive = order.totalCentavos - order.commissionCentavos - order.gatewayFeeCentavos - refunded;

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
      <p className="mt-4 text-xs text-muted-foreground">Production and shipping steps arrive with delivery tracking.</p>
    </>
  );
}
