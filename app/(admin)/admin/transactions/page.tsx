import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ordersBySelection, parseListParams } from "@/lib/data/admin-money";
import { loadDealPage } from "@/lib/data/deals";
import { php } from "@/lib/format";
import { Pager } from "../orders/list-controls";

export const metadata = { title: "Transactions" };

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseListParams(await searchParams, []);
  const { deals, paged } = await loadDealPage("admin_selections", params);
  const selections = paged.rows.flatMap((id) => deals.selections.find((s) => s.id === id) ?? []);
  const orders = await ordersBySelection(selections.map((s) => s.id));

  return (
    <>
      <PageHeader
        eyebrow="Commercial tracking"
        title="Recorded Supplier Selections"
        description="Each selection with the order started from it. TULAY never holds buyer money; payments go through the gateway."
      />

      {selections.length === 0 ? (
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
              {selections.map((s) => {
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
      {paged.pages > 1 && <Pager data={paged} params={params} />}
    </>
  );
}
