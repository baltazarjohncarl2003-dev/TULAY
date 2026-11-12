import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listClaims } from "@/lib/data/claims";
import { date } from "@/lib/format";
import type { ClaimType } from "@/lib/types";

export const metadata = { title: "My claims" };

const TYPE_LABEL: Record<ClaimType, string> = {
  damage: "Damaged, wrong or missing",
  return: "Change-of-mind return",
  defect: "Print defect",
};

export default async function BuyerClaimsPage() {
  const claims = await listClaims("buyer");

  return (
    <>
      <PageHeader
        eyebrow="Purchases"
        title="My claims"
        description="Damaged, wrong or missing items, returns and print defects you reported on your orders."
      />

      {claims.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">
                    <Link href={`/buyer/claims/${c.id}`} className="underline-offset-4 hover:underline">
                      {c.ref}
                    </Link>
                  </TableCell>
                  <TableCell>{c.orderRef}</TableCell>
                  <TableCell>{c.supplierName}</TableCell>
                  <TableCell>{TYPE_LABEL[c.type]}</TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell>{date(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="No claims yet." />
      )}
    </>
  );
}
