import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listOrders } from "@/lib/data/orders";
import { date, php } from "@/lib/format";
import { RefundForm } from "./refund-form";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage() {
  const orders = await listOrders("admin");

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Orders"
        description="Every order with its commission, gateway fee and refunds. A refund cannot exceed what is still refundable."
      />

      {orders.length === 0 ? (
        <EmptyState title="No orders yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Gateway fee</TableHead>
                <TableHead>Refunded</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const refunded = o.refunds.reduce((sum, r) => (r.status === "failed" ? sum : sum + r.amountCentavos), 0);
                const refundable = o.totalCentavos - refunded;
                return (
                  <TableRow key={o.id}>
                    <TableCell>{o.ref}</TableCell>
                    <TableCell>{o.supplierName}</TableCell>
                    <TableCell>{php(o.totalCentavos)}</TableCell>
                    <TableCell>{php(o.commissionCentavos)}</TableCell>
                    <TableCell>{php(o.gatewayFeeCentavos)}</TableCell>
                    <TableCell>{php(refunded)}</TableCell>
                    <TableCell>
                      <StatusPill status={o.status} />
                    </TableCell>
                    <TableCell>{date(o.paidAt)}</TableCell>
                    <TableCell>
                      {o.paidAt !== null && refundable > 0 && (
                        <RefundForm orderId={o.id} refundableCentavos={refundable} idempotencyKey={crypto.randomUUID()} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
