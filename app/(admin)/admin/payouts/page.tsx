import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { PAYOUT_STATUSES, listAdminPayouts, parseListParams } from "@/lib/data/admin-money";
import { payoutDelayDays } from "@/lib/data/orders";
import { date, php } from "@/lib/format";
import { ListFilters, NeedsRole, Pager } from "../orders/list-controls";
import { ReleasePayout } from "./release-payout";

export const metadata = { title: "Payouts" };

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const header = <PageHeader eyebrow="Finance" title="Payouts" description="What each supplier is paid for delivered orders." />;
  if (!canAdmin(user, "finance")) {
    return (
      <>
        {header}
        <NeedsRole role="finance" />
      </>
    );
  }

  const params = parseListParams(await searchParams, PAYOUT_STATUSES);
  const [payouts, delay] = await Promise.all([listAdminPayouts(params), payoutDelayDays()]);

  return (
    <>
      {header}
      <div className="mb-6">
        <Notice>
          Payouts are scheduled {delay} days after delivery (admin setting). Releasing records that the money was sent to the supplier.
        </Notice>
      </div>

      <ListFilters params={params} statuses={PAYOUT_STATUSES} placeholder="Payout ref or supplier" />

      {payouts.rows.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No payouts match." : "No payouts scheduled yet."} />
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
              {payouts.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.ref}</TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell>{php(p.amountCentavos)}</TableCell>
                  <TableCell>
                    <StatusPill status={p.status} />
                    {p.status === "scheduled" && p.warnings.length > 0 && (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">Check before release</span>
                    )}
                  </TableCell>
                  <TableCell>{date(p.scheduledAt)}</TableCell>
                  <TableCell>{date(p.releasedAt)}</TableCell>
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
                  <TableCell>
                    {p.status === "scheduled" && (
                      <ReleasePayout
                        payoutId={p.id}
                        payoutRef={p.ref}
                        supplierName={p.supplierName}
                        amountCentavos={p.amountCentavos}
                        orderRefs={p.orders.map((o) => o.ref)}
                        warnings={p.warnings}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={payouts} params={params} />
    </>
  );
}
