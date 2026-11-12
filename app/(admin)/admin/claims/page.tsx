import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { claimSettings, listClaims } from "@/lib/data/claims";
import { date, label } from "@/lib/format";
import type { Claim } from "@/lib/types";

export const metadata = { title: "Claims" };

const DAY_MS = 24 * 60 * 60 * 1000;

// Escalated first, then open claims past the supplier's answer window, then the rest.
// Within a group the server order (newest first) stays.
function sortClaims(claims: Claim[], responseDays: number): Claim[] {
  const staleBefore = Date.now() - responseDays * DAY_MS;
  const rank = (c: Claim) => {
    if (c.status === "escalated") return 0;
    if (c.status === "open" && Date.parse(c.createdAt) < staleBefore) return 1;
    return 2;
  };
  return [...claims].sort((a, b) => rank(a) - rank(b));
}

export default async function AdminClaimsPage() {
  const [claims, settings] = await Promise.all([listClaims("admin"), claimSettings()]);
  const sorted = sortClaims(claims, settings.responseDays);
  const escalated = claims.filter((c) => c.status === "escalated").length;

  return (
    <>
      <PageHeader
        eyebrow="After-sales"
        title="Claims"
        description="Every claim on TULAY. Escalated claims wait for a TULAY decision and show first."
      />

      {escalated > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {escalated} {escalated === 1 ? "claim is" : "claims are"} waiting for a TULAY decision.
          </Notice>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No claims yet." />
      ) : (
        <div className="overflow-x-auto">
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
              {sorted.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/claims/${c.id}`} className="font-medium underline underline-offset-2">
                      {c.ref}
                    </Link>
                  </TableCell>
                  <TableCell>{c.orderRef}</TableCell>
                  <TableCell>{c.supplierName}</TableCell>
                  <TableCell>{label(c.type)}</TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell>{date(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
