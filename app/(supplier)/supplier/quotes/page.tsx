import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager } from "@/app/(admin)/admin/orders/list-controls";
import { parseListParams } from "@/lib/data/admin-money";
import { loadDealPage } from "@/lib/data/deals";
import { php, quoteKnownTotal } from "@/lib/format";

export const metadata = { title: "Quotation History" };

export default async function SupplierQuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseListParams(await searchParams, []);
  const { deals, paged } = await loadDealPage("supplier_quotes", params);
  const supplierId = deals.viewer.supplierId;
  // paged.rows holds quote ids, newest first.
  const quotes = paged.rows.flatMap((id) => deals.quotes.find((q) => q.id === id) ?? []);

  return (
    <>
      <PageHeader
        eyebrow="Commercial proposals"
        title="Quotation History"
        description="Past versions are kept as an audit trail."
      />

      {quotes.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>RFQ</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Known total</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => {
                const total = quoteKnownTotal(q);
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.ref}</TableCell>
                    <TableCell>{deals.rfqs.find((r) => r.id === q.rfqId)?.ref ?? q.rfqId}</TableCell>
                    <TableCell>{`v${q.revision}`}</TableCell>
                    <TableCell>{php(q.unitPriceCentavos)}</TableCell>
                    <TableCell>
                      {total.partial ? `${php(total.totalCentavos)} (partial)` : php(total.totalCentavos)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/supplier/rfqs/${q.rfqId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="No quotations submitted yet.">
          {supplierId ? null : (
            <Link href="/supplier/profile" className="text-primary underline">
              Apply as a supplier first
            </Link>
          )}
        </EmptyState>
      )}
      {paged.pages > 1 && <Pager data={paged} params={params} />}
    </>
  );
}
