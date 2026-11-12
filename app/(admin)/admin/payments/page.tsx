import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPayments, listRefunds } from "@/lib/data/orders";
import { date, label, php } from "@/lib/format";
import { UnmatchedRefund } from "./unmatched-refund";

export const metadata = { title: "Payments" };

export default async function AdminPaymentsPage() {
  const [payments, refunds] = await Promise.all([listPayments(), listRefunds()]);
  const needsReview = payments.filter((p) => p.status === "needs_review").length;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        description="Every payment the gateway reported, and the refunds issued against them."
      />

      {needsReview > 0 && (
        <div className="mb-6">
          <Notice tone="warn">
            {needsReview} {needsReview === 1 ? "payment did" : "payments did"} not match an open checkout and need a refund.
          </Notice>
        </div>
      )}

      {payments.length === 0 ? (
        <EmptyState title="No payments yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provider ref</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const flagged = p.status === "needs_review";
                const orderRefs = p.checkouts?.orders.map((o) => o.ref).join(", ") || "—";
                return (
                  <TableRow key={p.id} className={flagged ? "bg-amber-50 dark:bg-amber-950/40" : undefined}>
                    <TableCell>{date(p.created_at)}</TableCell>
                    <TableCell>{orderRefs}</TableCell>
                    <TableCell>{label(p.method)}</TableCell>
                    <TableCell>{php(p.amount_centavos)}</TableCell>
                    <TableCell>{php(p.fee_centavos)}</TableCell>
                    <TableCell>
                      <StatusPill status={p.status} />
                    </TableCell>
                    <TableCell>{p.provider_ref ?? "—"}</TableCell>
                    <TableCell>{date(p.paid_at)}</TableCell>
                    <TableCell>
                      {flagged && <UnmatchedRefund paymentId={p.id} idempotencyKey={crypto.randomUUID()} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Refunds</h2>
      {refunds.length === 0 ? (
        <EmptyState title="No refunds yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{date(r.created_at)}</TableCell>
                  <TableCell>{r.orders?.ref ?? "Unmatched payment"}</TableCell>
                  <TableCell>{php(r.amount_centavos)}</TableCell>
                  <TableCell>
                    <StatusPill status={r.status} />
                  </TableCell>
                  <TableCell>{r.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
