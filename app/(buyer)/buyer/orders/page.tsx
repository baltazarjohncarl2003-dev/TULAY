import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listOrders } from "@/lib/data/orders";
import { date, php } from "@/lib/format";

export const metadata = { title: "My orders" };

export default async function BuyerOrdersPage() {
  const orders = await listOrders("buyer");

  return (
    <>
      <PageHeader eyebrow="Purchases" title="My orders" description="Payments, production and deliveries for everything you bought." />

      {orders.length ? (
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
              {orders.map((o) => {
                const [first] = o.items;
                const payUrl =
                  o.status === "pending_payment" && o.payment?.status === "pending" && o.payment.providerRef
                    ? `/pay/fake/${o.payment.providerRef}`
                    : null;
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
