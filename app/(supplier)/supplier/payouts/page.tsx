import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPayouts, myPayableBalance, payoutDelayDays } from "@/lib/data/orders";
import { date, php } from "@/lib/format";

export const metadata = { title: "Payouts" };

export default async function SupplierPayoutsPage() {
  const [payouts, balance, delay] = await Promise.all([listPayouts(), myPayableBalance(), payoutDelayDays()]);

  return (
    <>
      <PageHeader
        eyebrow="Supplier"
        title="Payouts"
        description="What TULAY owes your business and the payouts released to you."
      />

      <section className="mb-8 flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm text-muted-foreground">Currently owed to you</h2>
        {balance < 0 ? (
          <Notice tone="warn">You owe {php(Math.abs(balance))}; it will be deducted from your next payout.</Notice>
        ) : (
          <p className="text-2xl font-semibold">{php(balance)}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Payouts are released {delay} days after delivery. Later valid claims are deducted from the next payout.
        </p>
      </section>

      <h2 className="mb-3 text-lg font-semibold">Payouts</h2>
      {payouts.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Released</TableHead>
                <TableHead>Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.ref}</TableCell>
                  <TableCell>{php(p.amount_centavos)}</TableCell>
                  <TableCell>
                    <StatusPill status={p.status} />
                  </TableCell>
                  <TableCell>{date(p.scheduled_at)}</TableCell>
                  <TableCell>{date(p.released_at)}</TableCell>
                  <TableCell>{p.payout_items.map((i) => i.orders?.ref ?? "—").join(", ") || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="No payouts yet." />
      )}
    </>
  );
}
