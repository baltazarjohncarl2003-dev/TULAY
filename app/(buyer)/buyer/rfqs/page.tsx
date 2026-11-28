import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager } from "@/app/(admin)/admin/orders/list-controls";
import { parseListParams } from "@/lib/data/admin-money";
import { loadDealPage } from "@/lib/data/deals";
import { qty } from "@/lib/format";

export const metadata = { title: "Manage RFQs" };

export default async function BuyerRfqsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams, []);
  const { deals, paged } = await loadDealPage("buyer_rfqs", params);
  // paged.rows holds this page's RFQ ids, newest first.
  const rfqs = paged.rows.flatMap((id) => deals.rfqs.find((r) => r.id === id) ?? []);

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
      {paged.pages > 1 && <Pager data={paged} params={params} />}
    </>
  );
}
