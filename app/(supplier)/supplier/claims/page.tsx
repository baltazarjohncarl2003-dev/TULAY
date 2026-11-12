import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSessionUser } from "@/lib/auth";
import { claimSettings, listClaims } from "@/lib/data/claims";
import { date, label } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { RestockingFee } from "./restocking-fee";

export const metadata = { title: "Claims" };

/** Basis points as a percent text with integer math only ("250" -> "2.5"). */
function percentText(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return String(whole);
  return frac % 10 === 0 ? `${whole}.${frac / 10}` : `${whole}.${String(frac).padStart(2, "0")}`;
}

export default async function SupplierClaimsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const [claims, settings, { data: supplier, error }] = await Promise.all([
    listClaims("supplier"),
    claimSettings(),
    supabase.from("suppliers").select("restocking_fee_bps").eq("owner_id", user.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader
        eyebrow="Supplier"
        title="Claims"
        description="Claims on your orders. Answer each open claim within the response time shown."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Restocking fee</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {`Charged only on change-of-mind returns. TULAY's cap is ${percentText(settings.restockingFeeMaxBps)}% (0% = restocking fees are off).`}
          </p>
          <RestockingFee currentBps={supplier?.restocking_fee_bps ?? 0} capBps={settings.restockingFeeMaxBps} />
        </CardContent>
      </Card>

      {claims.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/supplier/claims/${c.id}`} className="text-primary underline">
                      {c.ref}
                    </Link>
                  </TableCell>
                  <TableCell>{c.orderRef}</TableCell>
                  <TableCell className="capitalize">{label(c.type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={c.status} />
                      {c.status === "open" && (
                        <span className="text-xs text-muted-foreground">Answer within {settings.responseDays} days</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{date(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="No claims">Claims on your orders appear here.</EmptyState>
      )}
    </>
  );
}
