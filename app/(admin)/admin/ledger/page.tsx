import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { LEDGER_ACCOUNTS, adminLedger, parseListParams } from "@/lib/data/admin-money";
import { date, php } from "@/lib/format";
import { ListFilters, NeedsRole, Pager } from "../orders/list-controls";

export const metadata = { title: "Ledger" };

const ACCOUNT_NAME: Record<string, string> = {
  gateway_clearing: "Gateway clearing",
  supplier_payable: "Owed to suppliers",
  platform_revenue: "TULAY revenue",
  unmatched_payments: "Unmatched payments",
};

export default async function AdminLedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const header = (
    <PageHeader
      eyebrow="Finance"
      title="Ledger"
      description="Every money movement, double-entry. Each balance is shown on its natural side: money held at the gateway counts debits, the rest count credits."
    />
  );
  if (!canAdmin(user, "finance")) {
    return (
      <>
        {header}
        <NeedsRole role="finance" />
      </>
    );
  }

  const params = parseListParams(await searchParams, LEDGER_ACCOUNTS);
  const { balances, entries } = await adminLedger(params);

  return (
    <>
      {header}
      <div className="mb-6">
        <Notice>
          Every transaction balances: debits equal credits. Entries are never edited; mistakes are fixed with reversing
          entries.
        </Notice>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LEDGER_ACCOUNTS.map((a) => (
          <Card key={a} size="sm">
            <CardHeader>
              <CardTitle>{ACCOUNT_NAME[a]}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight">{php(balances[a] ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ListFilters params={params} statuses={LEDGER_ACCOUNTS} placeholder="Order ref, supplier or memo" />

      {entries.rows.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No entries match." : "No ledger entries yet."} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Debit</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead>Memo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{date(e.createdAt)}</TableCell>
                  <TableCell>{ACCOUNT_NAME[e.account] ?? e.account}</TableCell>
                  <TableCell>{e.supplierName ?? "—"}</TableCell>
                  <TableCell>
                    {e.order ? (
                      <Link href={`/admin/orders/${e.order.id}`} className="text-primary hover:underline">
                        {e.order.ref}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{php(e.debit)}</TableCell>
                  <TableCell>{php(e.credit)}</TableCell>
                  <TableCell>{e.memo}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={entries} params={params} />
    </>
  );
}
