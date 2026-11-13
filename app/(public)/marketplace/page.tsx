import { Suspense } from "react";
import { CATEGORIES } from "@/lib/categories";
import { listLiveCatalog, listSuppliers, searchProducts } from "@/lib/data/catalog";
import { MarketplaceClient } from "./marketplace-client";

export const metadata = { title: "Marketplace" };

// shortcut: ?q= runs in the database; the other filters, sort and paging run in the browser over up to
// 500 matches (or every live listing without a query). Move them into the URL + search_catalog as the catalog grows.
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const [products, suppliers] = await Promise.all([
    q
      ? searchProducts({ q, sort: "relevance", pageSize: 500 }).then((r) => r.hits.map((h) => h.product))
      : listLiveCatalog().then((c) => c.products),
    listSuppliers(),
  ]);
  return (
    <Suspense fallback={null}>
      <MarketplaceClient products={products} suppliers={suppliers} categories={CATEGORIES} />
    </Suspense>
  );
}

// Awaiting searchParams makes this subtree request-time, so the listing is server-rendered with the real query.
async function Listing({ searchParams }: Search) {
  await searchParams;
  return <MarketplaceClient products={publicProducts()} suppliers={approvedSuppliers()} categories={CATEGORIES} />;
}
