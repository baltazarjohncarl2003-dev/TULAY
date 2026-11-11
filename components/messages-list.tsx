import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_SUPPLIER, DEMO_USERS, INVITES, MESSAGES, RFQS } from "@/lib/demo/data";
import type { Role } from "@/lib/types";
import { date } from "@/lib/format";

/** RFQs that have at least one invite not declined, scoped to what this role can see. */
function visibleRfqs(role: Role) {
  return RFQS.filter((rfq) => {
    const activeInvites = INVITES.filter((i) => i.rfqId === rfq.id && i.status !== "declined");
    if (activeInvites.length === 0) return false;
    if (role === "buyer") return rfq.buyerId === DEMO_USERS.buyer.id;
    if (role === "supplier") return activeInvites.some((i) => i.supplierId === DEMO_SUPPLIER.id);
    return true;
  });
}

export function MessagesList({ role }: { role: Role }) {
  const rfqs = visibleRfqs(role);

  return (
    <>
      <PageHeader
        eyebrow="Business conversations"
        title="Your sourcing messages"
        description="All conversations are linked to a sourcing request and an invited supplier. Conversations are not public chat rooms."
      />

      {rfqs.length > 0 ? (
        <div className="flex flex-col gap-3">
          {rfqs.map((rfq) => {
            const messages = MESSAGES.filter((m) => m.rfqId === rfq.id);
            const lastAt = messages.map((m) => m.createdAt).sort().at(-1) ?? null;
            return (
              <article
                key={rfq.id}
                className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold tracking-wide text-primary uppercase">{rfq.ref}</span>
                  <strong className="font-semibold">{rfq.product}</strong>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <StatusPill status={rfq.status} />
                    <span>
                      {messages.length} {messages.length === 1 ? "message" : "messages"}
                    </span>
                    <span>{lastAt ? `Last message ${date(lastAt)}` : "No messages yet"}</span>
                  </div>
                </div>
                <Link href={`/${role}/rfqs/${rfq.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Open conversation
                </Link>
              </article>
            );
          })}
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
