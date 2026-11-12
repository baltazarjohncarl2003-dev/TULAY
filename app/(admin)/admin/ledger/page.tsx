import { EmptyState, Notice, PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerSummary } from "@/lib/data/orders";
import { date, php } from "@/lib/format";

export const metadata = { title: "Ledger" };

const ACCOUNTS = [
  { key: "gateway_clearing", name: "Gateway clearing" },
  { key: "supplier_payable", name: "Owed to suppliers" },
  { key: "platform_revenue", name: "TULAY revenue" },
  { key: "unmatched_payments", name: "Unmatched payments" },
] as const;

const ACCOUNT_NAME: Record<string, string> = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a.name]));

export default async function AdminLedgerPage() {
  const { balances, entries } = await ledgerSummary();

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Ledger"
        description="Every money movement, double-entry. Balances are credits minus debits."
      />
      <div className="mb-6">
        <Notice>
          Every transaction balances: debits equal credits. Entries are never edited; mistakes are fixed with reversing
          entries.
        </Notice>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNTS.map((a) => (
          <Card key={a.key} size="sm">
            <CardHeader>
              <CardTitle>{a.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight">{php(balances[a.key] ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No ledger entries yet." />
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
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{date(e.created_at)}</TableCell>
                  <TableCell>{ACCOUNT_NAME[e.account] ?? e.account}</TableCell>
                  <TableCell>{e.suppliers?.business_name ?? "—"}</TableCell>
                  <TableCell>{e.orders?.ref ?? "—"}</TableCell>
                  <TableCell>{php(e.debit_centavos)}</TableCell>
                  <TableCell>{php(e.credit_centavos)}</TableCell>
                  <TableCell>{e.memo}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
