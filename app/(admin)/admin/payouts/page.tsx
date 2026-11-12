import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPayouts, payoutDelayDays } from "@/lib/data/orders";
import { date, php } from "@/lib/format";
import { ReleasePayout } from "./release-payout";

export const metadata = { title: "Payouts" };

export default async function AdminPayoutsPage() {
  const [payouts, delay] = await Promise.all([listPayouts(), payoutDelayDays()]);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Payouts"
        description="What each supplier is paid for delivered orders."
      />
      <div className="mb-6">
        <Notice>
          Payouts are scheduled {delay} days after delivery (admin setting). Releasing records that the money was sent to the supplier.
        </Notice>
      </div>

      {payouts.length === 0 ? (
        <EmptyState title="No payouts scheduled yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => {
                const orderRefs = p.payout_items.flatMap((i) => (i.orders ? [i.orders.ref] : [])).join(", ") || "—";
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.ref}</TableCell>
                    <TableCell>{p.suppliers?.business_name ?? "Unknown"}</TableCell>
                    <TableCell>{php(p.amount_centavos)}</TableCell>
                    <TableCell>
                      <StatusPill status={p.status} />
                    </TableCell>
                    <TableCell>{date(p.scheduled_at)}</TableCell>
                    <TableCell>{date(p.released_at)}</TableCell>
                    <TableCell>{orderRefs}</TableCell>
                    <TableCell>{p.status === "scheduled" && <ReleasePayout payoutId={p.id} />}</TableCell>
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
