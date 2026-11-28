import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import type { BusinessType, PriceTier, Product, Supplier } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

// Reads for the public catalog, storefronts, the supplier's own listings and the admin queue.
// Public catalog reads run as an anonymous visitor and are cached for everyone (tag CATALOG_TAG,
// about a minute); the rest run as the caller, so RLS decides what each person sees.
// Rows map onto the existing Product / Supplier shapes so components keep their props.

/** Cache tag for every public catalog read; actions that change a live listing or supplier call updateTag(CATALOG_TAG). */
export const CATALOG_TAG = "catalog";

/** Marks a "use cache" read as public catalog data: shared by all visitors, refreshed within a minute. */
function catalogCache() {
  cacheTag(CATALOG_TAG);
  cacheLife("minutes");
}

type DbSupplierStatus = Database["public"]["Enums"]["supplier_status"];

// owner_id is not readable by visitors, so ownerId is always "" here.
export const SUPPLIER_COLUMNS =
  "id, business_name, legal_name, city, province, moq, lead_days, description, status, business_type, years_operating, delivery_areas, keywords, max_quantity, auto_invites, restocking_fee_bps, categories(slug)" as const;
const PRODUCT_COLUMNS =
  "id, supplier_id, title, description, moq, unit, indicative_price_centavos, lead_days, status, return_class, listing_type, created_at, stock, categories(slug), product_media(storage_path, sort_order)" as const;

export type CatalogSort = "relevance" | "newest" | "oldest" | "price_asc" | "price_desc" | "moq" | "name";
export type CatalogSearch = {
  q?: string;
  /** Category slug; a parent includes its children. */
  category?: string;
  listingType?: "product" | "service";
  businessType?: BusinessType;
  province?: string;
  minCentavos?: number | null;
  maxCentavos?: number | null;
  maxMoq?: number | null;
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
};
export type ProductHit = { product: Product; supplier: Supplier; score: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public URL of a file in the public product-media bucket. */
export function mediaUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${storagePath}`;
}

/** The UI never says "verified" for anything but admin approval; it calls that state "approved". */
function supplierStatus(s: DbSupplierStatus): Supplier["status"] {
  if (s === "verified") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "suspended" || s === "restricted") return "suspended";
  return "pending";
}

type SupplierRow = {
  id: string; business_name: string; legal_name: string; city: string; province: string; moq: number; lead_days: number;
  description: string; status: DbSupplierStatus; business_type: BusinessType; years_operating: number | null;
  delivery_areas: string[]; keywords: string; max_quantity: number | null; auto_invites: boolean; restocking_fee_bps: number; categories: { slug: string } | null;
};
export function toSupplier(s: SupplierRow): Supplier {
  return {
    id: s.id, ownerId: "", businessName: s.business_name, legalName: s.legal_name, categorySlug: s.categories?.slug ?? "",
    city: s.city, province: s.province, description: s.description, moq: s.moq, leadDays: s.lead_days,
    status: supplierStatus(s.status), deliveryAreas: s.delivery_areas, keywords: s.keywords,
    autoInvites: s.auto_invites,
    restockingFeeBps: s.restocking_fee_bps,
    maxQuantity: s.max_quantity, businessType: s.business_type, yearsOperating: s.years_operating,
  };
}

type ProductRow = {
  id: string; supplier_id: string; title: string; description: string; moq: number; unit: Product["unit"];
  indicative_price_centavos: number | null; lead_days: number | null; status: Product["status"];
  return_class: Product["returnClass"]; listing_type: Product["listingType"]; created_at: string;
  stock: number | null; categories: { slug: string } | null; product_media: { storage_path: string; sort_order: number }[];
};
type VariantRow = { id: string; name: string; price_delta_centavos: number; stock: number | null; active: boolean; sort_order: number };
const VARIANT_COLUMNS = "product_variants(id, name, price_delta_centavos, stock, active, sort_order)" as const;

function toProduct(
  p: ProductRow,
  tiers?: { min_qty: number; unit_price_centavos: number }[],
  variants?: VariantRow[],
): Product {
  const imageUrls = [...p.product_media].sort((a, b) => a.sort_order - b.sort_order).map((m) => mediaUrl(m.storage_path));
  return {
    id: p.id, supplierId: p.supplier_id, categorySlug: p.categories?.slug ?? "", title: p.title, description: p.description,
    moq: p.moq, unit: p.unit, indicativePriceCentavos: p.indicative_price_centavos, leadDays: p.lead_days,
    imageUrl: imageUrls[0] ?? null, imageUrls, status: p.status, returnClass: p.return_class, createdAt: p.created_at,
    listingType: p.listing_type, stock: p.stock,
    variants: variants
      ?.filter((v) => v.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({ id: v.id, name: v.name, priceDeltaCentavos: v.price_delta_centavos, stock: v.stock })),
    priceTiers: tiers
      ?.map((t): PriceTier => ({ minQty: t.min_qty, unitPriceCentavos: t.unit_price_centavos }))
      .sort((a, b) => a.minQty - b.minQty),
  };
}

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

// ---------------------------------------------------------------- public catalog

// Categories: use the static tree in lib/categories.ts (it mirrors the migration).

/** Live listings (approved, verified supplier) among the given ids, with price tiers and options; ids that are not live are simply absent. */
export async function listLiveProductsByIds(ids: string[]): Promise<{ products: Product[]; suppliers: Supplier[] }> {
  const valid = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (valid.length === 0) return { products: [], suppliers: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(`${PRODUCT_COLUMNS}, price_tiers(min_qty, unit_price_centavos), ${VARIANT_COLUMNS}, suppliers!inner(${SUPPLIER_COLUMNS})`)
    .in("id", valid)
    .eq("status", "approved")
    .eq("suppliers.status", "verified");
  if (error) fail(error);
  const suppliers = new Map<string, Supplier>();
  for (const p of data) if (p.suppliers) suppliers.set(p.suppliers.id, toSupplier(p.suppliers));
  return { products: data.map((p) => toProduct(p, p.price_tiers, p.product_variants)), suppliers: [...suppliers.values()] };
}

/** A listing as a small tile (supplier rows and cards): enough to show and link it. */
export type ListingTile = Pick<Product, "id" | "title" | "imageUrl" | "categorySlug" | "indicativePriceCentavos" | "moq" | "unit">;
export type CatalogOverview = {
  /** Live listings per category slug (children counted under their own slug). */
  categoryCounts: Record<string, number>;
  hasServices: boolean;
  /** Each verified supplier's 4 newest live listings, newest first; suppliers without one are absent. */
  tilesBySupplier: Record<string, ListingTile[]>;
};

// The shape public.catalog_overview() builds; parsed so a change in the function shows as an error.
const overviewSchema = z.object({
  categories: z.record(z.string(), z.number().int()),
  has_services: z.boolean(),
  tiles: z.record(
    z.string(),
    z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        category_slug: z.string(),
        price_centavos: z.number().int().nullable(),
        moq: z.number().int(),
        unit: z.enum(["pcs", "boxes", "packs", "sets", "kg"]),
        image_path: z.string().nullable(),
      }),
    ),
  ),
});

/** Catalog counts and supplier tiles in one small read, whatever the catalog size. Cached for all visitors. */
export async function getCatalogOverview(): Promise<CatalogOverview> {
  "use cache";
  catalogCache();
  const { data, error } = await createPublicClient().rpc("catalog_overview");
  if (error) fail(error);
  const o = overviewSchema.parse(data);
  const tilesBySupplier: Record<string, ListingTile[]> = {};
  for (const [supplierId, tiles] of Object.entries(o.tiles)) {
    tilesBySupplier[supplierId] = tiles.map((t) => ({
      id: t.id,
      title: t.title,
      categorySlug: t.category_slug,
      indicativePriceCentavos: t.price_centavos,
      moq: t.moq,
      unit: t.unit,
      imageUrl: t.image_path ? mediaUrl(t.image_path) : null,
    }));
  }
  return { categoryCounts: o.categories, hasServices: o.has_services, tilesBySupplier };
}

/** Live listing count per category slug (children counted under their own slug). */
export async function countLiveByCategory(): Promise<Record<string, number>> {
  return (await getCatalogOverview()).categoryCounts;
}

/** Ids of suppliers with a live listing matching a search (same match as searchProducts). Cached for all visitors. */
export async function searchSupplierIds(q: string): Promise<string[]> {
  "use cache";
  catalogCache();
  if (!q.trim()) return [];
  const { data, error } = await createPublicClient().rpc("search_catalog_supplier_ids", { p_query: q });
  if (error) fail(error);
  return data ?? [];
}

/** Id and date of every live listing, newest first, for the sitemap. Read in pages of 1,000 (the API row limit). */
export async function listLiveProductRefs(): Promise<{ id: string; createdAt: string }[]> {
  "use cache";
  catalogCache();
  const supabase = createPublicClient();
  const out: { id: string; createdAt: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, created_at, suppliers!inner(status)")
      .eq("status", "approved")
      .eq("suppliers.status", "verified")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + 999);
    if (error) fail(error);
    out.push(...data.map((p) => ({ id: p.id, createdAt: p.created_at })));
    if (data.length < 1000) return out;
  }
}

/** One page of live listings, ranked or sorted by the database (search_catalog). */
export async function searchProducts(s: CatalogSearch = {}): Promise<{ hits: ProductHit[]; total: number }> {
  "use cache";
  catalogCache();
  const supabase = createPublicClient();
  const page = Math.max(1, s.page ?? 1);
  const { data: rows, error } = await supabase.rpc("search_catalog", {
    p_query: s.q ?? "",
    p_category_slug: s.category || undefined,
    p_listing_type: s.listingType,
    p_business_type: s.businessType,
    p_province: s.province || undefined,
    p_min_price_centavos: s.minCentavos ?? undefined,
    p_max_price_centavos: s.maxCentavos ?? undefined,
    p_max_moq: s.maxMoq ?? undefined,
    p_sort: s.sort ?? "relevance",
    p_page: page,
    p_page_size: s.pageSize ?? 12,
  });
  if (error) fail(error);
  if (rows.length === 0) return page > 1 ? searchProducts({ ...s, page: 1 }) : { hits: [], total: 0 };

  const { data, error: e2 } = await supabase
    .from("products")
    .select(`${PRODUCT_COLUMNS}, suppliers(${SUPPLIER_COLUMNS})`)
    .in("id", rows.map((r) => r.product_id));
  if (e2) fail(e2);
  const byId = new Map(data.map((p) => [p.id, p]));
  const hits = rows.flatMap((r) => {
    const p = byId.get(r.product_id);
    return p?.suppliers ? [{ product: toProduct(p), supplier: toSupplier(p.suppliers), score: r.score }] : [];
  });
  return { hits, total: Number(rows[0].total_count) };
}

/** A live listing with its tiers and supplier, or null if it is not public (owners and admins also see their own). */
export const getProduct = cache(async (id: string): Promise<{ product: Product; supplier: Supplier } | null> => {
  if (!UUID.test(id)) return null;
  // Not public: owners and admins may still see it through their own RLS.
  return (await getLiveProduct(id)) ?? readProduct(await createClient(), id);
});

async function getLiveProduct(id: string): Promise<{ product: Product; supplier: Supplier } | null> {
  "use cache";
  catalogCache();
  return readProduct(createPublicClient(), id);
}

async function readProduct(
  supabase: ReturnType<typeof createPublicClient>,
  id: string,
): Promise<{ product: Product; supplier: Supplier } | null> {
  const { data: p, error } = await supabase
    .from("products")
    .select(`${PRODUCT_COLUMNS}, price_tiers(min_qty, unit_price_centavos), ${VARIANT_COLUMNS}, suppliers(${SUPPLIER_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error);
  if (!p?.suppliers) return null;
  return { product: toProduct(p, p.price_tiers, p.product_variants), supplier: toSupplier(p.suppliers) };
}

/** Approved suppliers for the directory and filters, by name. */
export async function listSuppliers(): Promise<Supplier[]> {
  "use cache";
  catalogCache();
  const supabase = createPublicClient();
  // shortcut: loads every approved supplier for client-side filtering; page it in the database past a few hundred.
  const { data, error } = await supabase.from("suppliers").select(SUPPLIER_COLUMNS).eq("status", "verified").order("business_name");
  if (error) fail(error);
  return data.map(toSupplier);
}

/** An approved supplier's storefront with its live listings, newest first; null if not public. */
export async function getStorefront(id: string): Promise<{ supplier: Supplier; products: Product[] } | null> {
  "use cache";
  catalogCache();
  if (!UUID.test(id)) return null;
  const supabase = createPublicClient();
  const { data: s, error } = await supabase.from("suppliers").select(SUPPLIER_COLUMNS).eq("id", id).eq("status", "verified").maybeSingle();
  if (error) fail(error);
  if (!s) return null;
  const { data: products, error: e2 } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("supplier_id", id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (e2) fail(e2);
  return { supplier: toSupplier(s), products: products.map((p) => toProduct(p)) };
}

// ---------------------------------------------------------------- supplier workspace

/** The signed-in supplier's listings in every status (with review notes), newest first. Empty if not a supplier. */
export async function listMyProducts(): Promise<{ supplierId: string | null; canList: boolean; products: Product[] }> {
  const user = await getSessionUser();
  if (!user) return { supplierId: null, canList: false, products: [] };
  const supabase = await createClient();
  const { data: s, error } = await supabase.from("suppliers").select("id, status").eq("owner_id", user.id).maybeSingle();
  if (error) fail(error);
  if (!s) return { supplierId: null, canList: false, products: [] };
  const { data, error: e2 } = await supabase
    .from("products")
    .select(`${PRODUCT_COLUMNS}, price_tiers(min_qty, unit_price_centavos), ${VARIANT_COLUMNS}`)
    .eq("supplier_id", s.id)
    .order("created_at", { ascending: false });
  if (e2) fail(e2);
  const { data: notes, error: e3 } = await supabase.rpc("product_review_notes", { p_ids: data.map((p) => p.id) });
  if (e3) fail(e3);
  const noteFor = new Map((notes ?? []).map((n) => [n.product_id, n.note]));
  return {
    supplierId: s.id,
    canList: s.status === "verified",
    products: data.map((p) => ({ ...toProduct(p, p.price_tiers, p.product_variants), reviewNote: noteFor.get(p.id) ?? "" })),
  };
}

// ---------------------------------------------------------------- admin

// ---------------------------------------------------------------- saved items

/** Saved product and supplier ids for the signed-in user; null for visitors (they use browser storage). */
export async function listMySaved(): Promise<{ products: string[]; suppliers: string[] } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_items").select("kind, target_id").order("created_at", { ascending: false });
  if (error) fail(error);
  return {
    products: data.filter((r) => r.kind === "product").map((r) => r.target_id),
    suppliers: data.filter((r) => r.kind === "supplier").map((r) => r.target_id),
  };
}
