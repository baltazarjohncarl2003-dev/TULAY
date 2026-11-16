import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { manualRefundsByOrder } from "@/lib/data/claims";
import { listOrders } from "@/lib/data/orders";
import { orderPayableNets, youReceive } from "@/lib/data/payouts";
import { mySupplierId, nextStep } from "@/lib/data/supplier";
import { date, php, qty } from "@/lib/format";
import { getCourier } from "@/lib/shipping";
import { carrierLabel } from "@/lib/shipping/couriers";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BulkBook } from "./bulk-book";

export const metadata = { title: "Orders" };

const CLOSED = ["delivered", "completed", "cancelled"];
// Courier orders TULAY can book now: no tracking yet, and paid stock orders or custom orders in production.
const readyToBook = (o: Order) =>
  o.fulfilmentMode === "courier" &&
  !o.shipment &&
  (o.status === "in_production" || ((o.status === "paid" || o.status === "confirmed") && !o.custom));

// The courier that can book from TULAY. The fake one throws in production; the page must still render there.
function bookableCourier() {
  try {
    return getCourier().name;
  } catch {
    return null;
  }
}

const TABS = [
  { key: "action", label: "Needs action" },
  { key: "open", label: "In progress" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;

export default async function SupplierOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const tab = TABS.find((t) => t.key === view)?.key ?? "all";
  const supplierId = await mySupplierId();
  const [orders, manual, nets] = await Promise.all([
    listOrders("supplier"),
    manualRefundsByOrder(),
    supplierId ? orderPayableNets(supplierId) : ({} as Record<string, number>),
  ]);
  const shown = orders.filter((o) =>
    tab === "action" ? nextStep(o)?.action : tab === "open" ? !CLOSED.includes(o.status) : tab === "closed" ? CLOSED.includes(o.status) : true,
  );

  const courier = bookableCourier();

  return (
    <>
      <PageHeader
        eyebrow="Supplier"
        title="Orders"
        description="Orders to your business. Buyer contact details appear on each order once it is paid or confirmed."
      />

      <nav aria-label="Order filters" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/supplier/orders?view=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(buttonVariants({ variant: t.key === tab ? "default" : "outline", size: "sm" }))}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {courier && (
        <BulkBook
          courierLabel={carrierLabel(courier)}
          orders={orders.filter(readyToBook).map((o) => ({ id: o.id, ref: o.ref }))}
        />
      )}

      {shown.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>You receive</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((o) => {
                const receive = youReceive(o, manual[o.id] ?? 0, nets[o.id]);
                const step = nextStep(o);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <Link href={`/supplier/orders/${o.id}`} className="text-primary underline">
                        {o.ref}
                      </Link>
                      {o.paymentOption === "cod" && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">COD</span>}
                    </TableCell>
                    <TableCell>{o.items.map((i) => `${i.title} × ${qty(i.quantity)}`).join(", ")}</TableCell>
                    <TableCell>{php(o.totalCentavos)}</TableCell>
                    <TableCell>{receive === null ? "—" : php(receive)}</TableCell>
                    <TableCell>
                      <StatusPill status={o.status} />
                    </TableCell>
                    <TableCell className={step?.action ? "font-medium" : "text-muted-foreground"}>{step?.label ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{o.shipment?.trackingRef ?? "—"}</TableCell>
                    <TableCell>
                      <span className="sr-only">{o.paymentOption === "cod" ? "Confirmed (COD) " : "Paid "}</span>
                      {date(o.paidAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title={tab === "action" ? "Nothing needs your action." : "No orders here."}>
          <p>Orders appear here once a buyer has paid or confirmed cash on delivery.</p>
        </EmptyState>
      )}
    </>
  );
}
