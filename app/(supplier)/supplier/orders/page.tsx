import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listOrders } from "@/lib/data/orders";
import { date, php, qty } from "@/lib/format";
import type { Order } from "@/lib/types";

export const metadata = { title: "Orders" };

/** What the supplier keeps: total less TULAY commission, the gateway fee it bears, and succeeded refunds. */
function youReceive(o: Order): number {
  const refunded = o.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountCentavos, 0);
  return o.totalCentavos - o.commissionCentavos - o.gatewayFeeCentavos - refunded;
}

export default async function SupplierOrdersPage() {
  const orders = await listOrders("supplier");

  return (
    <>
      <PageHeader
        eyebrow="Supplier"
        title="Orders"
        description="Paid orders to your business. Buyer contact details appear on each order once it is paid."
      />

      {orders.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>You receive</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/supplier/orders/${o.id}`} className="text-primary underline">
                      {o.ref}
                    </Link>
                  </TableCell>
                  <TableCell>{o.items.map((i) => `${i.title} × ${qty(i.quantity)}`).join(", ")}</TableCell>
                  <TableCell>{php(o.totalCentavos)}</TableCell>
                  <TableCell>{php(youReceive(o))}</TableCell>
                  <TableCell>
                    <StatusPill status={o.status} />
                  </TableCell>
                  <TableCell>{date(o.paidAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="No paid orders yet.">
          <p>Orders appear here once a buyer has paid.</p>
        </EmptyState>
      )}
    </>
  );
}
