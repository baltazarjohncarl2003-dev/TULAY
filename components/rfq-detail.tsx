import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DEMO_SUPPLIER,
  DEMO_USERS,
  INVITES,
  MESSAGES,
  OFFERS,
  latestQuotes,
  supplierById,
} from "@/lib/demo/data";
import { date, label, php, qty, quoteKnownTotal } from "@/lib/format";
import type { Offer, Quote, Rfq, RfqInvite, RfqStatus, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QuoteComparison } from "@/components/quote-comparison";
import { MessageThread,OfferResponse, QuoteActions, type MessageThreadData } from "@/components/rfq-detail-client";

const STEPS: { status: RfqStatus; label: string }[] = [
  { status: "under_review", label: "Submitted" },
  { status: "matching", label: "Matching" },
  { status: "invited", label: "Invited" },
  { status: "quoting", label: "Quotations" },
  { status: "supplier_selected", label: "Selected" },
];

// Terminal: no more quotes, counteroffers or selection.
const TERMINAL: RfqStatus[] = ["cancelled", "supplier_selected", "draft"];

const BACK_LINK: Record<Role, { href: string; label: string }> = {
  buyer: { href: "/buyer/rfqs", label: "← All requests" },
  supplier: { href: "/supplier/invites", label: "← RFQ invitations" },
  admin: { href: "/admin/rfqs", label: "← RFQ queue" },
};

export function RfqDetail({ rfq, role }: { rfq: Rfq; role: Role }) {
  // Suppliers only ever see their own rows.
  const visible = (supplierId: string) => role !== "supplier" || supplierId === DEMO_SUPPLIER.id;
  const me = role === "buyer" ? DEMO_USERS.buyer.id : role === "supplier" ? DEMO_USERS.supplier.id : null;
  const back = BACK_LINK[role];

  const allOffers = OFFERS.filter((o) => o.rfqId === rfq.id);
  const offers = allOffers
    .filter((o) => visible(o.supplierId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const invites = INVITES.filter((i) => i.rfqId === rfq.id && visible(i.supplierId));
  const closed = rfq.status === "cancelled" || rfq.status === "supplier_selected";

  const threads: MessageThreadData[] = invites
    .filter((i) => i.status !== "declined")
    .map((i) => {
      const supplierName = supplierById(i.supplierId)?.businessName ?? "Supplier";
      return {
        supplierId: i.supplierId,
        supplierName,
        messages: MESSAGES.filter((m) => m.rfqId === rfq.id && m.supplierId === i.supplierId).map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.createdAt,
          mine: m.senderId === me,
          sender:
            m.senderId === me ? "You" : m.senderId === DEMO_USERS.buyer.id ? DEMO_USERS.buyer.name : supplierName,
        })),
      };
    });
  const composer = role === "admin" ? "none" : closed ? "closed" : "send";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Sourcing request · ${rfq.ref}`}
        title={rfq.product}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={rfq.status} />
            <span>
              {qty(rfq.quantity)} {rfq.unit} · {rfq.city}, {rfq.province}
            </span>
          </span>
        }
        actions={
          <>
            <Link href={back.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {back.label}
            </Link>
            {role === "buyer" && rfq.status === "draft" && (
              <Link href={`/buyer/rfqs/new?draft=${rfq.id}`} className={buttonVariants({ size: "sm" })}>
                Edit draft
              </Link>
            )}
          </>
        }
      />

      <ol aria-label="Request progress" className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const current = s.status === rfq.status;
          return (
            <li
              key={s.status}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
                current ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <span className="font-semibold">{i + 1}</span>
              {s.label}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Product & specifications">
          <div className="flex flex-col gap-2 text-sm">
            <p>{rfq.description || "—"}</p>
            <h3 className="pt-1 font-medium">Specifications</h3>
            <p>{rfq.specs || "—"}</p>
          </div>
          <div className="flex flex-col">
            <Row k="Required by" v={date(rfq.requiredBy)} />
            <Row k="Target budget" v={rfq.budgetCentavos === null ? "Not specified" : php(rfq.budgetCentavos)} />
          </div>
        </Panel>

        <Panel title="Matched suppliers">
          {invites.length ? (
            <ul className="flex flex-col divide-y">
              {invites.map((i) => (
                <li key={i.supplierId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <strong className="font-medium">{supplierById(i.supplierId)?.businessName ?? "Supplier"}</strong>
                  <StatusPill status={i.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No supplier invitations recorded yet." />
          )}
        </Panel>
      </div>

      <Suspense fallback={null}>
        <LatestQuotes rfq={rfq} role={role} invites={invites} />
      </Suspense>

      <Panel title="Negotiation history">
        {offers.length ? (
          <ul className="flex flex-col divide-y">
            {offers.map((o) => {
              const answered = allOffers.some((x) => x.relatedOfferId === o.id);
              const canRespond = o.action === "counter" && !answered && o.actorId !== me && role !== "admin";
              return <OfferItem key={o.id} offer={o} canRespond={canRespond} />;
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No counteroffers yet.</p>
        )}
      </Panel>

      <Panel title="Conversation">
        <p className="text-xs text-muted-foreground">
          Only the buyer and the supplier assigned to each thread should have access.
        </p>
        {threads.length ? (
          <MessageThread threads={threads} composer={composer} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Messages become available after an eligible supplier is invited to this RFQ.
          </p>
        )}
      </Panel>
    </div>
  );
}

/** Reads the clock, so it runs at request time behind a Suspense boundary (Cache Components). */
async function LatestQuotes({ rfq, role, invites }: { rfq: Rfq; role: Role; invites: RfqInvite[] }) {
  await connection();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const terminal = TERMINAL.includes(rfq.status);
  const quotes = latestQuotes(rfq.id).filter((q) => role !== "supplier" || q.supplierId === DEMO_SUPPLIER.id);

  return (
    <Panel
      eyebrow="Compare with clarity"
      title="Latest quotations"
      aside={`${quotes.length} supplier offer${quotes.length === 1 ? "" : "s"}`}
    >
      {role === "buyer" && quotes.length >= 2 && <QuoteComparison rfq={rfq} quotes={quotes} today={today} />}
      {quotes.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {quotes.map((q) => {
            const expired = q.validUntil < today;
            const supplierName = supplierById(q.supplierId)?.businessName ?? "Assigned supplier";
            const buyerCanAct = role === "buyer" && !terminal && !expired;
            const canSelect = buyerCanAct && invites.some((i) => i.supplierId === q.supplierId && i.status === "accepted");
            return (
              <QuoteCard
                key={q.id}
                rfq={rfq}
                quote={q}
                supplierName={supplierName}
                expired={expired}
                buyerCanAct={buyerCanAct}
                canSelect={canSelect}
                acceptOptions={acceptOptionsFor(q.id)}
                showRevise={role === "supplier" && !terminal}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState title="No supplier quotations have been submitted for this request." />
      )}
    </Panel>
  );
}

/** Counteroffers on this quote that the buyer has an accept reply to. */
function acceptOptionsFor(quoteId: string) {
  return OFFERS.filter(
    (o) =>
      o.quoteId === quoteId &&
      o.action === "counter" &&
      OFFERS.some((a) => a.action === "accept" && a.relatedOfferId === o.id),
  ).map((o) => ({
    id: o.id,
    label: `Accepted negotiation: ${php(o.unitPriceCentavos)}/unit · ${qty(o.quantity)} units`,
  }));
}

function QuoteCard({
  rfq,
  quote: q,
  supplierName,
  expired,
  buyerCanAct,
  canSelect,
  acceptOptions,
  showRevise,
}: {
  rfq: Rfq;
  quote: Quote;
  supplierName: string;
  expired: boolean;
  buyerCanAct: boolean;
  canSelect: boolean;
  acceptOptions: { id: string; label: string }[];
  showRevise: boolean;
}) {
  const { totalCentavos, partial } = quoteKnownTotal(q);
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">Supplier quotation</span>
          <h3 className="font-semibold">{supplierName}</h3>
        </div>
        <Badge variant="outline">Revision {q.revision}</Badge>
      </div>

      <p className="text-2xl font-bold">
        {php(q.unitPriceCentavos)} <span className="text-sm font-normal text-muted-foreground">/ {rfq.unit}</span>
      </p>
      <p className="text-sm text-muted-foreground">{qty(q.quantity)} units quoted · indicative offer</p>

      <div className="flex flex-col">
        <Row k="Known total" v={php(totalCentavos)} />
        <Row k="Setup" v={php(q.setupFeeCentavos)} />
        <Row k="Shipping" v={php(q.shippingFeeCentavos)} />
        <Row k="Tax" v={php(q.taxCentavos)} />
        <Row k="Lead time" v={`${q.leadDays} days`} />
        <Row k="Valid through" v={date(q.validUntil)} />
      </div>

      <p className="text-sm">
        <strong className="font-medium">Payment terms:</strong> {q.paymentTerms}
      </p>
      {q.notes && <p className="text-sm text-muted-foreground">{q.notes}</p>}

      {partial ? (
        <Notice tone="warn">Partial estimate — some charges were not provided.</Notice>
      ) : (
        <Notice>Estimated total of all disclosed charges; subject to confirmation.</Notice>
      )}
      {expired && <Notice tone="warn">This quotation has expired. Request an updated offer.</Notice>}

      {buyerCanAct && (
        <QuoteActions
          quote={q}
          supplierName={supplierName}
          minQuantity={rfq.quantity}
          canSelect={canSelect}
          acceptOptions={acceptOptions}
        />
      )}
      {showRevise && (
        <div>
          <Link href={`/supplier/rfqs/${rfq.id}/quote`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Revise quote
          </Link>
        </div>
      )}
    </article>
  );
}

function OfferItem({ offer: o, canRespond }: { offer: Offer; canRespond: boolean }) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm font-medium capitalize">
          {label(o.action)} · {php(o.unitPriceCentavos)}/unit
        </strong>
        <span className="text-xs text-muted-foreground">{date(o.createdAt)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {qty(o.quantity)} units · {o.leadDays} days · {o.paymentTerms}
      </p>
      {o.message && <p className="text-sm">{o.message}</p>}
      {canRespond && (
        <div className="pt-1">
          <OfferResponse />
        </div>
      )}
    </li>
  );
}

function Panel({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow?: string;
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          {eyebrow && <span className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</span>}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {aside && <span className="text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
