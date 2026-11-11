import Link from "next/link";
import { connection } from "next/server";
import { Check, TriangleAlert } from "lucide-react";
import { EmptyState, Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyApplication } from "@/lib/data/supplier";
import { DEMO_SUPPLIER, INVITES, PRODUCTS, RFQS, SELECTIONS, latestQuotes, rfqById } from "@/lib/demo/data";
import {
  REQUIRED_DOCUMENTS,
  businessDaysBetween,
  missingDocuments,
  profileCompleteness,
} from "@/lib/demo/supplier-stats";
import { date, php, qty } from "@/lib/format";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";

const LISTING_STATUSES = [
  { status: "approved", label: "Approved" },
  { status: "pending", label: "Pending review" },
  { status: "rejected", label: "Rejected" },
] as const;

export async function SupplierDashboard() {
  await connection();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const app = await getMyApplication();

  const missing = missingDocuments(app?.documents.map((d) => d.kind) ?? []);
  const completeness = profileCompleteness(app);
  const reason = app?.history[0]?.reason;
  const showReason = app && ["rejected", "suspended", "restricted"].includes(app.status) && reason;

  const invites = INVITES.filter((i) => i.supplierId === DEMO_SUPPLIER.id && i.status === "invited").flatMap((i) => {
    const rfq = rfqById(i.rfqId);
    return rfq ? [{ rfq, waiting: businessDaysBetween(rfq.createdAt, today) }] : [];
  });

  const awaiting = RFQS.filter((r) => !SELECTIONS.some((s) => s.rfqId === r.id)).flatMap((r) =>
    latestQuotes(r.id)
      .filter((q) => q.supplierId === DEMO_SUPPLIER.id)
      .map((quote) => ({ rfq: r, quote })),
  );

  const mine = PRODUCTS.filter((p) => p.supplierId === DEMO_SUPPLIER.id);

  return (
    <>
      <PageHeader
        eyebrow="Seller workspace"
        title={app?.businessName ?? "Set up your business"}
        actions={
          <Link href="/supplier/profile" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage profile
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        {!app ? (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>Apply to sell on TULAY</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3 text-sm">
              <p>Tell us about your company and upload your documents. TULAY reviews every application before you can quote.</p>
              <Link href="/supplier/profile" className={buttonVariants({ size: "sm" })}>
                Start application
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Approval status <StatusPill status={app.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Row k="Submitted" v={date(app.submittedAt)} />
              {showReason && <Notice tone="warn">Reason: {reason}</Notice>}
              <h3 className="pt-1 text-sm font-medium">Documents</h3>
              <ul className="flex flex-col divide-y">
                {REQUIRED_DOCUMENTS.map((kind) => {
                  const isMissing = missing.includes(kind);
                  return (
                    <li key={kind} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span>{SUPPLIER_DOCUMENT_KINDS[kind]}</span>
                      {isMissing ? (
                        <span className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                          <TriangleAlert aria-hidden className="size-4" /> Missing
                          <Link href="/supplier/profile" className="text-primary underline">
                            Upload
                          </Link>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-medium text-emerald-800 dark:text-emerald-300">
                          <Check aria-hidden className="size-4" /> Uploaded
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">You can quote only after approval.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>New RFQ invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {invites.length ? (
              <ul className="flex flex-col divide-y">
                {invites.map(({ rfq, waiting }) => (
                  <li key={rfq.id} className="flex flex-col gap-1 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong className="font-medium">{rfq.ref}</strong> · {rfq.product} · {qty(rfq.quantity)} {rfq.unit}
                      </span>
                      <Link
                        href={`/supplier/rfqs/${rfq.id}/quote`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Review &amp; quote
                      </Link>
                    </div>
                    <span className="text-muted-foreground">
                      Waiting {waiting} business day{waiting === 1 ? "" : "s"}
                    </span>
                    {waiting >= 1 && (
                      <span className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                        <TriangleAlert aria-hidden className="size-4" />
                        Reply within 24 business hours to keep receiving leads
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No new invitations." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quotes awaiting buyers</CardTitle>
          </CardHeader>
          <CardContent>
            {awaiting.length ? (
              <ul className="flex flex-col divide-y">
                {awaiting.map(({ rfq, quote }) => (
                  <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>
                      <strong className="font-medium">{quote.ref}</strong> · Revision {quote.revision} ·{" "}
                      {php(quote.unitPriceCentavos)}/unit · valid until {date(quote.validUntil)}
                    </span>
                    <Link href={`/supplier/rfqs/${rfq.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      View request
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No quotes waiting on a buyer." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Listings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {LISTING_STATUSES.map(({ status, label }) => (
                <Link key={status} href="/supplier/products" className="rounded-lg border p-3 hover:bg-muted/50">
                  <span className="block text-2xl font-bold">{mine.filter((p) => p.status === status).length}</span>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile completeness</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label htmlFor="profile-progress" className="text-sm font-medium">
              {completeness.done} of {completeness.total} complete
            </label>
            <progress id="profile-progress" className="w-full" value={completeness.done} max={completeness.total} />
            <ul className="flex flex-col gap-1 text-sm">
              {completeness.items.map((i) => (
                <li key={i.label} className="flex items-center gap-2">
                  {i.done ? (
                    <Check aria-hidden className="size-4 text-emerald-700" />
                  ) : (
                    <span aria-hidden className="size-4 text-center text-muted-foreground">
                      ○
                    </span>
                  )}
                  <span>
                    {i.label}
                    <span className="sr-only">{i.done ? " (done)" : " (not done)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Notice>Invitations, quotes and listings shown are sample data until deals go live.</Notice>
      </div>
    </>
  );
}
