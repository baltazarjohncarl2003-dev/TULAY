import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_SUPPLIER, QUOTES, rfqById } from "@/lib/demo/data";
import { php, quoteKnownTotal } from "@/lib/format";

export const metadata = { title: "Quotation history" };

export default function SupplierQuotesPage() {
  // Newest first; the same-day tie goes to the higher revision.
  const quotes = QUOTES.filter((q) => q.supplierId === DEMO_SUPPLIER.id).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision,
  );

  return (
    <>
      <PageHeader
        eyebrow="Commercial proposals"
        title="Quotation history"
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
                    <TableCell>{rfqById(q.rfqId)?.ref ?? q.rfqId}</TableCell>
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
        <EmptyState title="No quotations submitted yet." />
      )}
    </>
  );
}
