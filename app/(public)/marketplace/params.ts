import { BUSINESS_TYPE_LABEL } from "@/components/supplier-card";

// Shared by the server page (parses the URL) and the client (builds the next URL). No server-only imports.

export type Tab = "products" | "suppliers";
export type ListingFilter = "all" | "product" | "service";
export type Sort = "relevance" | "price_asc" | "price_desc" | "newest" | "oldest" | "moq" | "name";

export const MOQ_OPTIONS: [string, string][] = [
  ["all", "Any"],
  ["100", "100 or less"],
  ["500", "500 or less"],
  ["1000", "1,000 or less"],
  ["5000", "5,000 or less"],
];
export const PRODUCT_SORTS: [Sort, string][] = [
  ["relevance", "Relevance"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["moq", "Lowest MOQ"],
];
export const SUPPLIER_SORTS: [Sort, string][] = [
  ["relevance", "Relevance"],
  ["name", "Name A–Z"],
];

/** Whole pesos in, integer centavos out. Empty, decimal or invalid input is ignored (null). */
export function pesosToCentavos(input: string): number | null {
  const s = input.trim();
  return /^\d{1,9}$/.test(s) ? Number(s) * 100 : null;
}

export type MarketplaceParams = {
  q: string;
  category: string; // "all" or a slug
  type: ListingFilter;
  businessType: string; // "all" or a BusinessType
  region: string; // "all" or a province
  minPrice: string;
  maxPrice: string;
  maxMoq: string; // "all" | "100" | "500" | "1000" | "5000"
  sort: Sort;
  page: number; // 1..1000
  tab: Tab;
  view: "grid" | "list";
};

export function parseMarketplaceParams(get: (name: string) => string | null): MarketplaceParams {
  const fromUrl = (name: string, ok: (v: string) => boolean, fallback: string) => {
    const v = get(name);
    return v !== null && ok(v) ? v : fallback;
  };
  const typeParam = get("type");
  const tab: Tab = get("tab") === "suppliers" ? "suppliers" : "products";
  const sorts = (tab === "products" ? PRODUCT_SORTS : SUPPLIER_SORTS).map(([v]) => v as string);
  return {
    q: (get("q") ?? "").trim().slice(0, 200),
    category: get("category") || "all",
    type: typeParam === "product" || typeParam === "service" ? typeParam : "all",
    businessType: fromUrl("bt", (v) => v in BUSINESS_TYPE_LABEL, "all"),
    region: fromUrl("region", (v) => v.length <= 80, "all"),
    minPrice: fromUrl("min", (v) => /^\d{1,9}$/.test(v), ""),
    maxPrice: fromUrl("max", (v) => /^\d{1,9}$/.test(v), ""),
    maxMoq: fromUrl("moq", (v) => MOQ_OPTIONS.some(([o]) => o === v), "all"),
    sort: fromUrl("sort", (v) => sorts.includes(v), "relevance") as Sort,
    page: Math.min(1000, Math.max(1, Math.trunc(Number(get("page"))) || 1)),
    tab,
    view: get("view") === "list" ? "list" : "grid",
  };
}

/** Query string for the params; a value equal to its default is left out. */
export function marketplaceSearch(p: MarketplaceParams): string {
  const next = new URLSearchParams();
  const put = (name: string, value: string, fallback: string) => {
    if (value !== fallback) next.set(name, value);
  };
  put("q", p.q.trim(), "");
  put("category", p.category, "all");
  put("type", p.type, "all");
  put("tab", p.tab, "products");
  put("bt", p.businessType, "all");
  put("region", p.region, "all");
  put("min", p.minPrice, "");
  put("max", p.maxPrice, "");
  put("moq", p.maxMoq, "all");
  put("sort", p.sort, "relevance");
  put("view", p.view, "grid");
  put("page", String(p.page), "1");
  return next.toString();
}
