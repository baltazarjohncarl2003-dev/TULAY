import { Suspense } from "react";
import { liveCategories } from "@/lib/categories";
import {
  countLiveByCategory,
  getCatalogOverview,
  listSuppliers,
  searchProducts,
  searchSupplierIds,
} from "@/lib/data/catalog";
import type { BusinessType } from "@/lib/types";
import { MarketplaceClient } from "./marketplace-client";
import { parseMarketplaceParams, pesosToCentavos } from "./params";

export const metadata = { title: "Marketplace" };

const PAGE_SIZE = 12;

// Filtering, sorting and paging run in the database (searchProducts); only one page of 12 listings is sent.
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseMarketplaceParams((name) => {
    const v = sp[name];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  });
  const { q, category, type, businessType, region, minPrice, maxPrice, maxMoq, sort, page, tab } = params;
  const products = tab === "products";
  const [result, suppliers, counts, overview, supplierIds] = await Promise.all([
    searchProducts({
      q,
      category: category === "all" ? undefined : category,
      listingType: type === "all" ? undefined : type,
      businessType: businessType === "all" ? undefined : (businessType as BusinessType),
      province: region === "all" ? undefined : region,
      minCentavos: pesosToCentavos(minPrice),
      maxCentavos: pesosToCentavos(maxPrice),
      maxMoq: maxMoq === "all" ? null : Number(maxMoq),
      sort: products ? sort : "relevance",
      page: products ? page : 1,
      pageSize: PAGE_SIZE,
    }),
    listSuppliers(),
    countLiveByCategory(),
    getCatalogOverview(),
    q ? searchSupplierIds(q) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const shownPage = page > pages ? 1 : page;
  const supplierTitles = Object.fromEntries(
    Object.entries(overview.tilesBySupplier).map(([id, tiles]) => [id, tiles.slice(0, 3).map((t) => t.title)]),
  );
  return (
    <Suspense fallback={null}>
      <MarketplaceClient
        params={params}
        hits={result.hits.map(({ product, supplier }) => ({ product, supplier }))}
        total={result.total}
        page={shownPage}
        suppliers={suppliers}
        categories={liveCategories(counts)}
        supplierIdsForQuery={supplierIds}
        supplierTitles={supplierTitles}
      />
    </Suspense>
  );
}
