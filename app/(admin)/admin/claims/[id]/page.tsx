import { notFound } from "next/navigation";
import { EmptyState, Row, StatusPill } from "@/components/common";
import { ClaimThread } from "@/components/claim-thread";
import { getSessionUser } from "@/lib/auth";
import { getClaim } from "@/lib/data/claims";
import { getOrder, signedOrderFileUrls } from "@/lib/data/orders";
import { date, label, php } from "@/lib/format";
import { DecideClaim } from "./decide-claim";

export const metadata = { title: "Claim details" };

// Centavos shown only when there is an amount.
const amount = (c: number) => (c > 0 ? php(c) : null);

export default async function AdminClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, claim] = await Promise.all([getSessionUser(), getClaim(id)]);
  if (!user || !claim) notFound();

  const [order, files] = await Promise.all([getOrder(claim.orderId), signedOrderFileUrls(claim.evidence.map((e) => e.storagePath))]);
  if (!order) notFound();

  // An empty item list means the whole order is claimed.
  const claimed = (itemId: string) => claim.itemIds.length === 0 || claim.itemIds.includes(itemId);
  const buyerName = order.buyer?.name || "Buyer";

  return (
    <>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">After-sales</span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{claim.ref}</h1>
          <p className="text-sm text-muted-foreground">
            {label(claim.type)} claim on order {claim.orderRef} from {claim.supplierName}
          </p>
        </div>
        <StatusPill status={claim.status} />
      </header>

      {claim.status === "escalated" && <DecideClaim claimId={claim.id} refundableHintCentavos={order.totalCentavos} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-semibold">Order {order.ref}</h2>
          <Row k="Order total" v={php(order.totalCentavos)} />
          <Row k="Buyer" v={buyerName} />
          <Row k="Business" v={order.buyer?.businessName || null} />
          <Row k="Email" v={order.buyer?.email || null} />
          <Row k="Phone" v={order.buyer?.phone || null} />
          <Row k="Supplier" v={claim.supplierName} />
          <h3 className="mt-3 text-sm font-medium">Items</h3>
          {order.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <span>
                    {i.title}
                    {i.variantName && <span className="text-muted-foreground"> · {i.variantName}</span>}
                    {claimed(i.id) && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Claimed
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {i.quantity} × {php(i.unitPriceCentavos)} = {php(i.lineTotalCentavos)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-semibold">Claim</h2>
          <Row k="Opened" v={date(claim.createdAt)} />
          <Row k="Resolved" v={claim.resolvedAt ? date(claim.resolvedAt) : null} />
          <p className="mt-2 text-sm whitespace-pre-line">{claim.description}</p>
          <h3 className="mt-3 text-sm font-medium">Evidence</h3>
          {claim.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {claim.evidence.map((e) => (
                <li key={e.storagePath}>
                  {files[e.storagePath] ? (
                    <a href={files[e.storagePath]} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {e.fileName}
                    </a>
                  ) : (
                    e.fileName
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-semibold">Supplier response</h2>
          <p className="text-sm whitespace-pre-line">{claim.responseNote || "No response yet."}</p>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-semibold">Outcome</h2>
          <Row k="Remedy" v={claim.remedy ? label(claim.remedy) : null} />
          <Row k="Agreed refund" v={amount(claim.refundCentavos)} />
          <Row k="Restocking fee" v={amount(claim.restockingFeeCentavos)} />
          <Row
            k="Refunded online"
            v={claim.onlineRefund ? `${php(claim.onlineRefund.amountCentavos)} (${label(claim.onlineRefund.status)})` : null}
          />
          <Row
            k="Paid back by supplier"
            v={amount(claim.manualRefundCentavos) ? `${php(claim.manualRefundCentavos)}${claim.manualRefundRef ? ` · ${claim.manualRefundRef}` : ""}` : null}
          />
          <Row k="Return required" v={claim.returnRequired ? (claim.returnPayer ? `Yes, paid by ${claim.returnPayer}` : "Yes") : "No"} />
          <Row k="RA number" v={claim.raNumber} />
          <Row k="Return tracking" v={claim.returnTrackingRef || null} />
          <Row k="Return received" v={claim.returnReceivedAt ? date(claim.returnReceivedAt) : null} />
          {claim.decisionNote && (
            <>
              <h3 className="mt-3 text-sm font-medium">Decision note</h3>
              <p className="text-sm whitespace-pre-line">{claim.decisionNote}</p>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-semibold">History</h2>
          {claim.history.length === 0 ? (
            <EmptyState title="No history yet." />
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {claim.history.map((h) => (
                <li key={`${h.createdAt}-${h.toStatus}`} className="flex flex-col gap-0.5 border-l-2 pl-3">
                  <span className="font-medium">
                    {label(h.toStatus)} · <span className="text-muted-foreground">{date(h.createdAt)}</span>
                  </span>
                  {h.note && <span className="text-muted-foreground">{h.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="mt-6">
        <ClaimThread
          claimId={claim.id}
          messages={claim.messages}
          viewerId={user.id}
          names={{ [claim.buyerId]: buyerName, [claim.supplierOwnerId]: claim.supplierName }}
        />
      </div>
    </>
  );
}
