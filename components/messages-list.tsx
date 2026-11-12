import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { loadDeals } from "@/lib/data/deals";
import { date } from "@/lib/format";
import type { Role } from "@/lib/types";

export async function MessagesList({ role }: { role: Role }) {
  const deals = await loadDeals();

  // One row per invite that is not declined. Messages are per (RFQ, supplier) and arrive oldest first.
  const threads = deals.rfqs.flatMap((rfq) =>
    deals.invites
      .filter((i) => i.rfqId === rfq.id && i.status !== "declined")
      .map((i) => {
        const messages = deals.messages.filter((m) => m.rfqId === rfq.id && m.supplierId === i.supplierId);
        return {
          key: `${rfq.id}:${i.supplierId}`,
          rfq,
          supplierName: deals.suppliers.find((s) => s.id === i.supplierId)?.businessName || "Supplier",
          buyerName: deals.buyers[rfq.buyerId]?.name || "Buyer",
          count: messages.length,
          lastAt: messages.at(-1)?.createdAt ?? null,
        };
      }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Business conversations"
        title="Your sourcing messages"
        description="All conversations are linked to a sourcing request and an invited supplier. Conversations are not public chat rooms."
      />

      {threads.length > 0 ? (
        <div className="flex flex-col gap-3">
          {threads.map((t) => (
            <article
              key={t.key}
              className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">{t.rfq.ref}</span>
                <strong className="font-semibold">{t.rfq.product}</strong>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <StatusPill status={t.rfq.status} />
                  <span>Supplier: {t.supplierName}</span>
                  <span>Buyer: {t.buyerName}</span>
                  <span>
                    {t.count} {t.count === 1 ? "message" : "messages"}
                  </span>
                  <span>{t.lastAt ? `Last message ${date(t.lastAt)}` : "No messages yet"}</span>
                </div>
              </div>
              <Link href={`/${role}/rfqs/${t.rfq.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open conversation
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No active conversation threads">
          <p>Your conversations will appear here once an RFQ is matched with suppliers.</p>
          <Link href="/marketplace" className={buttonVariants({ variant: "default" })}>
            Explore marketplace
          </Link>
        </EmptyState>
      )}
    </>
  );
}
