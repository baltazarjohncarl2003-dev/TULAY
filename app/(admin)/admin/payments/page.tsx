import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import {
  PAYMENT_STATUSES,
  listAdminPayments,
  listRefundHistory,
  listRefundsNeedingAction,
  openUnmatchedCount,
  parseListParams,
  type AdminRefundRow,
} from "@/lib/data/admin-money";
import { date, label, php } from "@/lib/format";
import { ListFilters, NeedsRole, Pager } from "../orders/list-controls";
import { RefundActions } from "./refund-actions";
import { UnmatchedRefund } from "./unmatched-refund";

export const metadata = { title: "Payments" };

function RefundsTable({ rows, canAct }: { rows: AdminRefundRow[]; canAct: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Created</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
            {canAct && <TableHead>Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{date(r.createdAt)}</TableCell>
              <TableCell>
                {r.orderId ? (
                  <Link href={`/admin/orders/${r.orderId}`} className="text-primary hover:underline">
                    {r.orderRef}
                  </Link>
                ) : (
                  "Unmatched payment"
                )}
              </TableCell>
              <TableCell>{php(r.amountCentavos)}</TableCell>
              <TableCell>
                <StatusPill status={r.status} />
              </TableCell>
              <TableCell>{r.reason}</TableCell>
              {canAct && (
                <TableCell>
                  {r.status === "pending" && <RefundActions refundId={r.id} mode="retry" />}
                  {r.canReissue && <RefundActions refundId={r.id} mode="again" />}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const header = (
    <PageHeader
      eyebrow="Finance"
      title="Payments"
      description="Every payment the gateway reported, and the refunds issued against them."
    />
  );
  if (!canAdmin(user, "finance", "support")) {
    return (
      <>
        {header}
        <NeedsRole role="finance or support" />
      </>
    );
  }

  const sp = await searchParams;
  const params = parseListParams(sp, PAYMENT_STATUSES);
  const rpage = parseListParams({ page: sp.rpage }, []).page;
  const canAct = canAdmin(user, "finance");
  // Refund tables are finance-only in the database (RLS), so support sees payments without them.
  const [payments, open, needAction, history] = await Promise.all([
    listAdminPayments(params),
    openUnmatchedCount(),
    canAct ? listRefundsNeedingAction() : Promise.resolve([]),
    canAct ? listRefundHistory(rpage) : Promise.resolve(null),
  ]);

  return (
    <>
      {header}

      {canAct && open > 0 && (
        <div className="mb-6">
          <Notice tone="warn">
            {open} {open === 1 ? "payment did" : "payments did"} not match an open checkout and still need a refund.
          </Notice>
        </div>
      )}
      {needAction.length > 0 && (
        <div className="mb-6">
          <Notice tone="warn">
            {needAction.length} {needAction.length === 1 ? "refund needs" : "refunds need"} action: retry the pending ones and send failed ones again.
          </Notice>
        </div>
      )}

      <ListFilters params={params} statuses={PAYMENT_STATUSES} placeholder="Gateway ref or order ref" />

      {payments.rows.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No payments match." : "No payments yet."} />
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
              {payments.rows.map((p) => {
                const flagged = p.status === "needs_review" && !p.unmatchedRefund;
                return (
                  <TableRow key={p.id} className={flagged ? "bg-amber-50 dark:bg-amber-950/40" : undefined}>
                    <TableCell>{date(p.createdAt)}</TableCell>
                    <TableCell>
                      {p.orders.length === 0
                        ? "—"
                        : p.orders.map((o, i) => (
                            <span key={o.id}>
                              {i > 0 && ", "}
                              <Link href={`/admin/orders/${o.id}`} className="text-primary hover:underline">
                                {o.ref}
                              </Link>
                            </span>
                          ))}
                    </TableCell>
                    <TableCell>{label(p.method)}</TableCell>
                    <TableCell>{php(p.amountCentavos)}</TableCell>
                    <TableCell>{php(p.feeCentavos ?? 0)}</TableCell>
                    <TableCell>
                      <StatusPill status={p.status} />
                    </TableCell>
                    <TableCell>{p.providerRef ?? "—"}</TableCell>
                    <TableCell>{date(p.paidAt)}</TableCell>
                    <TableCell>
                      {p.status === "needs_review" &&
                        (p.unmatchedRefund ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            Refund <StatusPill status={p.unmatchedRefund.status} />
                          </span>
                        ) : (
                          canAct && <UnmatchedRefund paymentId={p.id} idempotencyKey={crypto.randomUUID()} />
                        ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={payments} params={params} />

      {canAct ? (
        <>
          {needAction.length > 0 && (
            <>
              <h2 className="mt-10 mb-3 text-lg font-semibold">Refunds needing action</h2>
              <RefundsTable rows={needAction} canAct />
            </>
          )}
          <h2 className="mt-10 mb-3 text-lg font-semibold">Refunds</h2>
          {history && history.rows.length > 0 ? (
            <>
              <RefundsTable rows={history.rows} canAct={false} />
              <Pager data={history} params={{ q: "", status: "", page: history.page }} pageKey="rpage" />
            </>
          ) : (
            <EmptyState title="No completed refunds yet." />
          )}
        </>
      ) : (
        <div className="mt-10">
          <NeedsRole role="finance" />
        </div>
      )}
    </>
  );
}
