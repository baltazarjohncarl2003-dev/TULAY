import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common";
import { loadDeals } from "@/lib/data/deals";
import { qty } from "@/lib/format";
import { latestQuotesOf } from "@/lib/quotes";
import { QuoteForm } from "./quote-form";

export const metadata = { title: "Submit quotation" };

export default async function SupplierQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, deals] = await Promise.all([params, loadDeals()]);
  const supplierId = deals.viewer.supplierId;
  // Only an invitation that is not declined, to an RFQ still open for quotes, can be quoted.
  const invited = deals.invites.some((i) => i.rfqId === id && i.supplierId === supplierId && i.status !== "declined");
  const rfq = invited ? deals.rfqs.find((r) => r.id === id) : undefined;
  if (!rfq || (rfq.status !== "invited" && rfq.status !== "quoting")) notFound();

  const latest = latestQuotesOf(deals.quotes, rfq.id).find((q) => q.supplierId === supplierId);
  // Created after the await (Cache Components): a fresh key per page load; a double submit reuses it.
  const idempotencyKey = crypto.randomUUID();

  return (
    <>
      <PageHeader
        eyebrow="Supplier quotation"
        title={rfq.product}
        description={`${rfq.ref} · Required quantity ${qty(rfq.quantity)} ${rfq.unit}`}
      />
      {/* Suspense: the form reads today's date for the date picker (Cache Components). */}
      <Suspense fallback={null}>
        <QuoteForm rfq={rfq} latest={latest} idempotencyKey={idempotencyKey} />
      </Suspense>
    </>
  );
}
