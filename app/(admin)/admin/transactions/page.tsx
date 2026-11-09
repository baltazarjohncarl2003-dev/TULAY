import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rfqById, SELECTIONS, supplierById } from "@/lib/demo/data";
import { php } from "@/lib/format";

export const metadata = { title: "Transactions" };

export default function AdminTransactionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Commercial tracking"
        title="Recorded supplier selections"
        description="Selection records only. TULAY never holds buyer money; payments arrive in Stage 4."
      />

      {SELECTIONS.length === 0 ? (
        <EmptyState title="No selections recorded yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>RFQ</TableHead>
                <TableHead>Buyer id</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Known value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SELECTIONS.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.ref}</TableCell>
                  <TableCell>{rfqById(s.rfqId)?.ref ?? s.rfqId}</TableCell>
                  <TableCell>{s.buyerId}</TableCell>
                  <TableCell>{supplierById(s.supplierId)?.businessName ?? "Unknown"}</TableCell>
                  <TableCell>
                    {php(s.amountCentavos)}
                    {s.amountIsEstimate && " (partial estimate)"}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={s.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
