import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager } from "@/app/(admin)/admin/orders/list-controls";
import { parseListParams } from "@/lib/data/admin-money";
import { listOrderPage, payUrlFor } from "@/lib/data/orders";
import { date, php } from "@/lib/format";

export const metadata = { title: "My Orders" };

export default async function BuyerOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseListParams(await searchParams, []);
  const orders = await listOrderPage("buyer", { page: params.page });

  return (
    <>
      <PageHeader eyebrow="Purchases" title="My Orders" description="Payments, production and deliveries for everything you bought." />

      {orders.total ? (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.rows.map((o) => {
                  const [first] = o.items;
                  const payUrl = payUrlFor(o);
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-semibold">
                        <Link href={`/buyer/orders/${o.id}`} className="underline-offset-4 hover:underline">
                          {o.ref}
                        </Link>
                      </TableCell>
                      <TableCell>{o.supplierName}</TableCell>
                      <TableCell>
                        {first ? first.title : "—"}
                        {o.items.length > 1 && <span className="text-muted-foreground"> +{o.items.length - 1} more</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{php(o.totalCentavos)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {o.status === "pending_payment" ? (
                            <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Awaiting payment
                            </span>
                          ) : (
                            <StatusPill status={o.status} />
                          )}
                          {payUrl && (
                            <Link href={payUrl} className="text-xs font-medium text-primary underline underline-offset-4">
                              Pay now
                            </Link>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{date(o.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {orders.pages > 1 && <Pager data={orders} params={params} />}
        </>
      ) : (
        <EmptyState title="No orders yet.">
          <Link href="/marketplace" className={buttonVariants()}>
            Browse the marketplace
          </Link>
        </EmptyState>
      )}
    </>
  );
}
