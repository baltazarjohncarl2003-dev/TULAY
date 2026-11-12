import { Suspense } from "react";
import { PageHeader } from "@/components/common";
import { CATEGORIES } from "@/lib/categories";
import { getProduct } from "@/lib/data/catalog";
import { loadDeals } from "@/lib/data/deals";
import { RfqForm } from "./rfq-form";

export const metadata = { title: "New RFQ" };

type Search = { draft?: string | string[]; product?: string | string[]; need?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewRfqPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const deals = await loadDeals();
  // Random values only after request data (cacheComponents), so this comes after the awaits.
  const idempotencyKey = crypto.randomUUID();
  const draftId = first(sp.draft);
  const existing =
    deals.rfqs.find(
      (r) =>
        r.id === draftId &&
        r.buyerId === deals.viewer.userId &&
        (r.status === "draft" || r.status === "needs_information"),
    ) ?? null;
  const productId = first(sp.product);
  const picked = productId ? await getProduct(productId) : null;
  const need = first(sp.need)?.trim() || null;

  return (
    <>
      <PageHeader
        eyebrow="Buyer sourcing"
        title="Create request for quotation"
        description="Complete the core requirements. TULAY automatically invites opted-in, eligible suppliers. Unmatched requests go to admin assistance."
      />
      <Suspense fallback={null}>
        <RfqForm
          categories={CATEGORIES}
          idempotencyKey={idempotencyKey}
          existing={existing}
          product={picked ? { product: picked.product, supplierName: picked.supplier.businessName } : null}
          need={need}
        />
      </Suspense>
    </>
  );
}
