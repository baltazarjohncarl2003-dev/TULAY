import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { ORDER_STATUSES, listAdminOrders, parseListParams } from "@/lib/data/admin-money";
import { date, php } from "@/lib/format";
import { ListFilters, NeedsRole, Pager } from "./list-controls";
import { RefundForm } from "./refund-form";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const header = (
    <PageHeader
      eyebrow="Finance"
      title="Orders"
      description="Every order with its commission, gateway fee and refunds. A refund cannot exceed what was paid online."
    />
  );
  if (!canAdmin(user, "finance", "support")) {
    return (
      <>
        {header}
        <NeedsRole role="finance or support" />
      </>
    );
  }

  const params = parseListParams(await searchParams, ORDER_STATUSES);
  const orders = await listAdminOrders(params);
  const canRefund = canAdmin(user, "finance");

  return (
    <>
      {header}
      <ListFilters params={params} statuses={ORDER_STATUSES} placeholder="Order ref, buyer email, supplier or payment ref" />

      {orders.rows.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No orders match." : "No orders yet."} />
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
                {canRefund && <TableHead>Refund</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.ref}
                    </Link>
                  </TableCell>
                  <TableCell>{o.supplierName}</TableCell>
                  <TableCell>{php(o.totalCentavos)}</TableCell>
                  <TableCell>{php(o.commissionCentavos)}</TableCell>
                  <TableCell>{php(o.gatewayFeeCentavos)}</TableCell>
                  <TableCell>{php(o.refundedCentavos)}</TableCell>
                  <TableCell>
                    <StatusPill status={o.status} />
                  </TableCell>
                  <TableCell>{date(o.paidAt)}</TableCell>
                  {canRefund && (
                    <TableCell>
                      {o.paidAt !== null && o.refundableCentavos > 0 && (
                        <RefundForm orderId={o.id} refundableCentavos={o.refundableCentavos} idempotencyKey={crypto.randomUUID()} />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={orders} params={params} />
    </>
  );
}
