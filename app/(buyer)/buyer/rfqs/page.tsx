import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadDeals } from "@/lib/data/deals";
import { qty } from "@/lib/format";

export const metadata = { title: "Manage RFQs" };

export default async function BuyerRfqsPage() {
  const deals = await loadDeals();
  // loadDeals returns rfqs newest first.
  const rfqs = deals.rfqs.filter((r) => r.buyerId === deals.viewer.userId);

  return (
    <>
      <PageHeader
        eyebrow="Your requests"
        title="Manage RFQs"
        description="Every requirement and response in one workspace."
        actions={
          <Link href="/buyer/rfqs/new" className={buttonVariants()}>
            + New RFQ
          </Link>
        }
      />

      {rfqs.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfqs.map((r) => {
                const isDraft = r.status === "draft";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-semibold">{r.ref}</TableCell>
                    <TableCell>{r.product}</TableCell>
                    <TableCell>
                      {qty(r.quantity)} {r.unit}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={isDraft ? `/buyer/rfqs/new?draft=${r.id}` : `/buyer/rfqs/${r.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {isDraft ? "Edit draft" : "View"}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="Ready to source something?">
          <Link href="/buyer/rfqs/new" className={buttonVariants()}>
            Create your first request
          </Link>
        </EmptyState>
      )}
    </>
  );
}
