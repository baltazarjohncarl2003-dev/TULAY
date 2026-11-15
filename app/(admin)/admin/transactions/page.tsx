import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ordersBySelection } from "@/lib/data/admin-money";
import { loadDeals } from "@/lib/data/deals";
import { php } from "@/lib/format";

export const metadata = { title: "Transactions" };

export default async function AdminTransactionsPage() {
  const deals = await loadDeals();
  const orders = await ordersBySelection(deals.selections.map((s) => s.id));

  return (
    <>
      <PageHeader
        eyebrow="Commercial tracking"
        title="Recorded supplier selections"
        description="Each selection with the order started from it. TULAY never holds buyer money; payments go through the gateway."
      />

      {deals.selections.length === 0 ? (
        <EmptyState title="No selections recorded yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>RFQ</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Known value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.selections.map((s) => {
                const rfq = deals.rfqs.find((r) => r.id === s.rfqId);
                const buyer = deals.buyers[s.buyerId];
                const supplier = deals.suppliers.find((x) => x.id === s.supplierId);
                const order = orders[s.id];
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.ref}</TableCell>
                    <TableCell>{rfq?.ref ?? s.rfqId}</TableCell>
                    <TableCell>{buyer ? `${buyer.name}, ${buyer.businessName}` : "Unknown"}</TableCell>
                    <TableCell>{supplier?.businessName ?? "Unknown"}</TableCell>
                    <TableCell>
                      {php(s.amountCentavos)}
                      {s.amountIsEstimate && " (estimate)"}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={s.status} />
                    </TableCell>
                    <TableCell>
                      {order ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Link href={`/admin/orders/${order.id}`} className="font-medium text-primary hover:underline">
                            {order.ref}
                          </Link>
                          <StatusPill status={order.status} />
                        </span>
                      ) : (
                        "Not paid"
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
