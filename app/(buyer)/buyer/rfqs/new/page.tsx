import { Suspense } from "react";
import { CATEGORIES } from "@/lib/categories";
import { getMyProfile } from "@/lib/data/account";
import { getProduct } from "@/lib/data/catalog";
import { loadDeal, type DealBundle } from "@/lib/data/deals";
import { getNumberSettings } from "@/lib/data/settings";
import { RfqForm } from "./rfq-form";

export const metadata = { title: "New RFQ" };

type Search = { draft?: string | string[]; product?: string | string[]; need?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewRfqPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const draftId = first(sp.draft);
  const [deals, { rfq_max_per_day: maxPerDay }, profile] = await Promise.all([
    draftId ? loadDeal(draftId) : Promise.resolve<DealBundle | null>(null),
    getNumberSettings(["rfq_max_per_day"]),
    getMyProfile(),
  ]);
  // Random values only after request data (cacheComponents), so this comes after the awaits.
  const idempotencyKey = crypto.randomUUID();
  const existing =
    deals?.rfqs.find(
      (r) =>
        r.id === draftId &&
        r.buyerId === deals.viewer.userId &&
        (r.status === "draft" || r.status === "needs_information"),
    ) ?? null;
  const productId = first(sp.product);
  const picked = productId ? await getProduct(productId) : null;
  const need = first(sp.need)?.trim() || null;

  return (
    <Suspense fallback={null}>
      <RfqForm
        categories={CATEGORIES}
        idempotencyKey={idempotencyKey}
        existing={existing}
        product={picked ? { product: picked.product, supplierName: picked.supplier.businessName } : null}
        need={need}
        maxPerDay={maxPerDay}
        author={{
          name: profile.businessName || profile.name,
          firstName: profile.name.split(" ")[0],
          avatarUrl: profile.avatarUrl,
          city: profile.city,
          province: profile.province,
        }}
      />
    </Suspense>
  );
}
