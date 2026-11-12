import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buyerStats, pipelineStage, type PipelineStage } from "@/lib/buyer-stats";
import { loadDeals } from "@/lib/data/deals";
import { date, php } from "@/lib/format";
import { compareQuotes, latestQuotesOf } from "@/lib/quotes";

const STAGES: { stage: PipelineStage; label: string }[] = [
  { stage: "draft", label: "Draft" },
  { stage: "in_review", label: "In review" },
  { stage: "quoting", label: "Quoting" },
  { stage: "negotiating", label: "Negotiating" },
  { stage: "closed", label: "Closed" },
];

export function BuyerDashboard() {
  return (
    <Suspense fallback={null}>
      <DashboardBody />
    </Suspense>
  );
}

/** Reads the clock (quote expiry) and the session, so it runs at request time behind Suspense (Cache Components). */
async function DashboardBody() {
  await connection();
  const deals = await loadDeals();
  const buyerId = deals.viewer.userId;
  const firstName = deals.buyers[buyerId]?.name.split(" ")[0] || "there";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const stats = buyerStats(deals, buyerId, today);
  const rfqs = deals.rfqs.filter((r) => r.buyerId === buyerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const tiles = [
    { label: "Open RFQs", value: stats.openRfqs },
    { label: "Quotes received", value: stats.quotesReceived },
    { label: "Awaiting your response", value: stats.awaitingYou },
    { label: "Suppliers selected", value: stats.suppliersSelected },
  ];

  const quoted = rfqs
    .map((rfq) => {
      const quotes = latestQuotesOf(deals.quotes, rfq.id);
      if (!quotes.length) return null;
      const lowest = Math.min(...compareQuotes(quotes, rfq.quantity).map((c) => c.totalCentavos));
      const validUntil = quotes.map((q) => q.validUntil).sort()[0];
      return { rfq, count: quotes.length, lowest, validUntil };
    })
    .filter((x) => x !== null);

  return (
    <>
      <PageHeader
        eyebrow="Buyer workspace"
        title={`Welcome back, ${firstName}`}
        actions={
          <>
            <Link href="/buyer/rfqs/new" className={buttonVariants()}>
              New RFQ
            </Link>
            <Link href="/search" className={buttonVariants({ variant: "outline" })}>
              Ask TULAY AI
            </Link>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href="/buyer/rfqs" className="rounded-lg border p-4 transition-colors hover:bg-muted/50">
              <div className="text-2xl font-bold tabular-nums">{t.value}</div>
              <div className="text-sm text-muted-foreground">{t.label}</div>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>RFQ pipeline</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map(({ stage, label }) => {
              const items = rfqs.filter((r) => pipelineStage(r, deals.offers) === stage);
              return (
                <div key={stage} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    {label}
                    <span className="tabular-nums text-muted-foreground">{items.length}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {items.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={r.status === "draft" ? `/buyer/rfqs/new?draft=${r.id}` : `/buyer/rfqs/${r.id}`}
                          className="block truncate rounded-md border px-2 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <span className="font-medium">{r.ref}</span> · {r.product}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest quotes</CardTitle>
          </CardHeader>
          <CardContent>
            {quoted.length ? (
              <ul className="flex flex-col divide-y">
                {quoted.map(({ rfq, count, lowest, validUntil }) => (
                  <li key={rfq.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-center gap-2 font-medium">
                        {rfq.product} <StatusPill status={rfq.status} />
                      </span>
                      <span className="text-muted-foreground">
                        {count} quote{count === 1 ? "" : "s"} · Lowest estimated total {php(lowest)} · Valid until{" "}
                        {date(validUntil)}
                      </span>
                    </div>
                    <Link href={`/buyer/rfqs/${rfq.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Compare quotes
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No quotes yet">Quotes appear here once suppliers respond to your RFQs.</EmptyState>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Link href="/buyer/saved" className={buttonVariants({ variant: "outline" })}>
            Saved items
          </Link>
          <Link href="/buyer/messages" className={buttonVariants({ variant: "outline" })}>
            Messages
          </Link>
          <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
            Browse marketplace
          </Link>
        </div>
      </div>
    </>
  );
}
