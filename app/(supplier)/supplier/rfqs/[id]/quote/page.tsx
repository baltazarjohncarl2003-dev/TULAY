import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common";
import { DEMO_SUPPLIER, INVITES, RFQS, latestQuotes, rfqById } from "@/lib/demo/data";
import { qty } from "@/lib/format";
import { QuoteForm } from "./quote-form";

export const metadata = { title: "Submit quotation" };

// Only RFQs where this supplier accepted the invitation can be quoted.
function hasAcceptedInvite(rfqId: string) {
  return INVITES.some((i) => i.rfqId === rfqId && i.supplierId === DEMO_SUPPLIER.id && i.status === "accepted");
}

export function generateStaticParams() {
  return RFQS.filter((r) => hasAcceptedInvite(r.id)).map((r) => ({ id: r.id }));
}

export default async function SupplierQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rfq = rfqById(id);
  if (!rfq || !hasAcceptedInvite(rfq.id)) notFound();

  const latest = latestQuotes(rfq.id).find((q) => q.supplierId === DEMO_SUPPLIER.id);

  return (
    <>
      <PageHeader
        eyebrow="Supplier quotation"
        title={rfq.product}
        description={`${rfq.ref} · Required quantity ${qty(rfq.quantity)} ${rfq.unit}`}
      />
      {/* Suspense: the form reads today's date for the date picker (Cache Components). */}
      <Suspense fallback={null}>
        <QuoteForm rfq={rfq} latest={latest} />
      </Suspense>
    </>
  );
}
