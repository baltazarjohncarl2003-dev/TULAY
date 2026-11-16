import Link from "next/link";
import { connection } from "next/server";
import { Check, TriangleAlert } from "lucide-react";
import { EmptyState, Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyProducts } from "@/lib/data/catalog";
import { listClaims } from "@/lib/data/claims";
import { loadDeals } from "@/lib/data/deals";
import { listMyNotifications } from "@/lib/data/notifications";
import { listOrders, listPayouts } from "@/lib/data/orders";
import { getNumberSettings } from "@/lib/data/settings";
import { getMyApplication, nextStep } from "@/lib/data/supplier";
import { date, dateTime, php, qty } from "@/lib/format";
import {
  REQUIRED_DOCUMENTS,
  businessDaysBetween,
  missingDocuments,
  profileCompleteness,
} from "@/lib/supplier-stats";
import { latestQuotesOf } from "@/lib/quotes";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";

const LISTING_STATUSES = [
  { status: "approved", label: "Approved" },
  { status: "pending", label: "Pending review" },
  { status: "rejected", label: "Rejected" },
] as const;

export async function SupplierDashboard() {
  await connection();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [deals, mine, orders, claims, payouts, notifications] = await Promise.all([
    loadDeals(),
    listMyProducts(),
    listOrders("supplier"),
    listClaims("supplier"),
    listPayouts(),
    listMyNotifications(5),
  ]);
  const app = await getMyApplication();
  // Admin setting; until it exists no reply-time warning is shown (nothing is hardcoded).
  const replyHours = await getNumberSettings(["invite_reply_hours"]).then(
    (s) => s.invite_reply_hours,
    () => null,
  );
  const supplierId = deals.viewer.supplierId;

  const missing = missingDocuments(app?.documents.map((d) => d.kind) ?? []);
  const completeness = profileCompleteness(app);
  const reason = app?.history[0]?.reason;
  const showReason = app && ["rejected", "suspended", "restricted"].includes(app.status) && reason;

  const invites = deals.invites
    .filter((i) => i.supplierId === supplierId && i.status === "invited")
    .flatMap((i) => {
      const rfq = deals.rfqs.find((r) => r.id === i.rfqId);
      // Counted from the day the invitation was sent, not the RFQ's draft date.
      return rfq ? [{ rfq, waiting: businessDaysBetween((i.createdAt ?? rfq.createdAt).slice(0, 10), today) }] : [];
    });

  const toAct = orders.filter((o) => nextStep(o)?.action);
  const proofsToSend = toAct.filter((o) => nextStep(o)?.label.includes("proof"));
  const openClaims = claims.filter((c) => ["open", "awaiting_return", "refund_pending", "replacement_pending"].includes(c.status));
  const outOfStock = mine.products.filter((p) => p.status === "approved" && p.stock === 0);
  const scheduledTotal = payouts.filter((p) => p.status === "scheduled").reduce((sum, p) => sum + p.amount_centavos, 0);
  const queue = [
    { label: "Orders to act on", count: toAct.length, href: "/supplier/orders?view=action" },
    { label: "Proofs to send", count: proofsToSend.length, href: "/supplier/orders?view=action" },
    { label: "Open claims", count: openClaims.length, href: "/supplier/claims" },
    { label: "Out of stock", count: outOfStock.length, href: "/supplier/products" },
  ];

  // RFQ status, not selections: RLS hides a competitor's selection from this supplier.
  const latest = deals.rfqs.filter((r) => r.status === "quoting").flatMap((r) =>
    latestQuotesOf(deals.quotes, r.id)
      .filter((q) => q.supplierId === supplierId)
      .map((quote) => ({ rfq: r, quote })),
  );
  const awaiting = latest.filter(({ quote }) => quote.validUntil >= today);
  const expired = latest.filter(({ quote }) => quote.validUntil < today);

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
                        <span className="flex items-center gap-1 font-medium text-success">
                          <Check aria-hidden className="size-4" /> Uploaded
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {app.status !== "verified" && <p className="text-xs text-muted-foreground">You can quote only after approval.</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Work queue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {queue.map((q) => (
                <Link key={q.label} href={q.href} className="rounded-lg border p-3 hover:bg-muted/50">
                  <span className="block text-2xl font-bold">{q.count}</span>
                  <span className="text-sm text-muted-foreground">{q.label}</span>
                </Link>
              ))}
            </div>
            <Link href="/supplier/payouts" className="text-sm text-primary underline">
              Scheduled payouts: {php(scheduledTotal)}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent updates</CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length ? (
              <ul className="flex flex-col divide-y">
                {notifications.map((n) => (
                  <li key={n.id} className="flex flex-col gap-0.5 py-2 text-sm">
                    <span className="font-medium">
                      {!n.readAt && <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">New</span>}
                      {n.link.startsWith("/") && !n.link.startsWith("//") ? (
                        <Link href={n.link} className="underline-offset-4 hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </span>
                    <span className="text-muted-foreground">{n.body}</span>
                    <span className="text-xs text-muted-foreground">{dateTime(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No updates yet." />
            )}
            <Link href="/supplier/notifications" className="mt-3 inline-block text-sm text-primary underline">
              All notifications
            </Link>
          </CardContent>
        </Card>

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
                    {replyHours !== null && waiting >= 1 && (
                      <span className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                        <TriangleAlert aria-hidden className="size-4" />
                        Reply within {replyHours} business hours to keep receiving leads
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
            {expired.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y border-t">
                {expired.map(({ rfq, quote }) => (
                  <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>
                      <strong className="font-medium">{quote.ref}</strong> · <StatusPill status="expired" /> since {date(quote.validUntil)}
                    </span>
                    <Link href={`/supplier/rfqs/${rfq.id}/quote`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Revise quote
                    </Link>
                  </li>
                ))}
              </ul>
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
                  <span className="block text-2xl font-bold">{mine.products.filter((p) => p.status === status).length}</span>
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
                    <Check aria-hidden className="size-4 text-success" />
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

      </div>
    </>
  );
}
