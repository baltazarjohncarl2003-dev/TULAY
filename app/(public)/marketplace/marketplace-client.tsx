"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type KeyboardEvent, useRef, useState } from "react";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { EmptyState, Notice, Row } from "@/components/common";
import { Field, NativeSelect } from "@/components/form";
import { ProductCard } from "@/components/product-card";
import { BUSINESS_TYPE_LABEL, SupplierCard } from "@/components/supplier-card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BusinessType, Category, Product, Supplier } from "@/lib/types";
import { label, php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "products" | "suppliers";
type ListingFilter = "all" | "product" | "service";
type Sort = "relevance" | "price_asc" | "price_desc" | "newest" | "moq" | "name";

const PAGE_SIZE = 12;
const TAB_IDS: Tab[] = ["products", "suppliers"];
const MOQ_OPTIONS: [string, string][] = [
  ["all", "Any"],
  ["100", "100 or less"],
  ["500", "500 or less"],
  ["1000", "1,000 or less"],
  ["5000", "5,000 or less"],
];
const PRODUCT_SORTS: [Sort, string][] = [
  ["relevance", "Relevance"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["newest", "Newest"],
  ["moq", "Lowest MOQ"],
];
const SUPPLIER_SORTS: [Sort, string][] = [
  ["relevance", "Relevance"],
  ["name", "Name A–Z"],
];
const LISTING_OPTIONS: [ListingFilter, string][] = [
  ["all", "All"],
  ["product", "Products"],
  ["service", "Services"],
];

type Filters = {
  term: string;
  category: string;
  type: ListingFilter;
  businessType: string;
  region: string;
  minCentavos: number | null;
  maxCentavos: number | null;
  maxMoq: string;
};

// ---- Pure logic: filter, sort, paginate ----

/** Whole pesos in, integer centavos out. Empty, decimal or invalid input is ignored (null). */
export function pesosToCentavos(input: string): number | null {
  const s = input.trim();
  return /^\d{1,9}$/.test(s) ? Number(s) * 100 : null;
}

/** A parent category includes its children. */
function inCategory(slug: string, category: string, categories: Category[]): boolean {
  if (category === "all" || slug === category) return true;
  return categories.find((c) => c.slug === slug)?.parentSlug === category;
}

function filterProducts(
  products: Product[],
  f: Filters,
  categories: Category[],
  bySupplier: Map<string, Supplier>,
): Product[] {
  const priced = f.minCentavos !== null || f.maxCentavos !== null;
  return products.filter((p) => {
    const s = bySupplier.get(p.supplierId);
    if (!inCategory(p.categorySlug, f.category, categories)) return false;
    if (f.type !== "all" && p.listingType !== f.type) return false;
    if (f.term && ![p.title, p.description, s?.businessName ?? ""].join(" ").toLowerCase().includes(f.term)) return false;
    if (f.maxMoq !== "all" && p.moq > Number(f.maxMoq)) return false;
    if (f.region !== "all" && s?.province !== f.region) return false;
    if (f.businessType !== "all" && s?.businessType !== f.businessType) return false;
    if (priced) {
      const price = p.indicativePriceCentavos;
      if (price === null) return false;
      if (f.minCentavos !== null && price < f.minCentavos) return false;
      if (f.maxCentavos !== null && price > f.maxCentavos) return false;
    }
    return true;
  });
}

function sortProducts(list: Product[], sort: Sort, term: string): Product[] {
  const newest = (a: Product, b: Product) => b.createdAt.localeCompare(a.createdAt);
  // Nulls last in both directions.
  const byPrice = (dir: 1 | -1) => (a: Product, b: Product) => {
    const pa = a.indicativePriceCentavos;
    const pb = b.indicativePriceCentavos;
    if (pa === pb) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  const rank = (p: Product) => (term && p.title.toLowerCase().includes(term) ? 0 : 1);
  const sorted = [...list];
  switch (sort) {
    case "price_asc":
      return sorted.sort(byPrice(1));
    case "price_desc":
      return sorted.sort(byPrice(-1));
    case "moq":
      return sorted.sort((a, b) => a.moq - b.moq);
    case "relevance":
      // The list arrives ranked by the database (or newest first without a query); sort is stable.
      return sorted.sort((a, b) => rank(a) - rank(b));
    default:
      return sorted.sort(newest);
  }
}

function filterSuppliers(suppliers: Supplier[], f: Filters, categories: Category[]): Supplier[] {
  return suppliers.filter((s) => {
    if (f.term && ![s.businessName, s.description, s.keywords].join(" ").toLowerCase().includes(f.term)) return false;
    if (!inCategory(s.categorySlug, f.category, categories)) return false;
    if (f.businessType !== "all" && s.businessType !== f.businessType) return false;
    if (f.region !== "all" && s.province !== f.region) return false;
    return true;
  });
}

function sortSuppliers(list: Supplier[], sort: Sort, term: string): Supplier[] {
  const sorted = [...list];
  if (sort === "name") return sorted.sort((a, b) => a.businessName.localeCompare(b.businessName));
  const rank = (s: Supplier) => (term && s.businessName.toLowerCase().includes(term) ? 0 : 1);
  return sorted.sort((a, b) => rank(a) - rank(b));
}

function paginate<T>(items: T[], requested: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(1, requested), totalPages);
  const start = (page - 1) * size;
  return {
    page,
    totalPages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + size, items.length),
    items: items.slice(start, start + size),
  };
}

/** Page numbers to show; 0 marks a gap. */
function pageList(page: number, totalPages: number): number[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i > 0 && n - pages[i - 1] > 1 ? [0, n] : [n]));
}

// ---- UI ----

type Props = { products: Product[]; suppliers: Supplier[]; categories: Category[] };

/** Reads the URL once per query, so a new ?q= or ?category= starts the filters fresh. */
export function MarketplaceClient(props: Props) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "all";
  const typeParam = params.get("type");
  const type: ListingFilter = typeParam === "product" || typeParam === "service" ? typeParam : "all";
  const tab: Tab = params.get("tab") === "suppliers" ? "suppliers" : "products";
  return (
    <Catalog
      key={`${q}|${category}|${type}|${tab}`}
      {...props}
      initialQuery={q}
      initialCategory={category}
      initialType={type}
      initialTab={tab}
    />
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      {pageList(page, totalPages).map((n, i) =>
        n === 0 ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={n}
            variant={n === page ? "secondary" : "outline"}
            size="sm"
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
          >
            {n}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

function Catalog({
  products,
  suppliers,
  categories,
  initialQuery,
  initialCategory,
  initialType,
  initialTab,
}: Props & { initialQuery: string; initialCategory: string; initialType: ListingFilter; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [type, setType] = useState<ListingFilter>(initialType);
  const [businessType, setBusinessType] = useState("all");
  const [region, setRegion] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxMoq, setMaxMoq] = useState("all");
  const [sort, setSort] = useState<Sort>("relevance");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const bySupplier = new Map(suppliers.map((s) => [s.id, s]));
  const provinces = [...new Set(suppliers.map((s) => s.province.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  const term = query.trim().toLowerCase();
  const filters: Filters = {
    term,
    category,
    type,
    businessType,
    region,
    minCentavos: pesosToCentavos(minPrice),
    maxCentavos: pesosToCentavos(maxPrice),
    maxMoq,
  };
  // The URL query already ran as a database search (stemming, synonyms, typos); only a different
  // "search within" term refines the products further here.
  const refine = term === initialQuery.trim().toLowerCase() ? "" : term;
  const sortedProducts = sortProducts(filterProducts(products, { ...filters, term: refine }, categories, bySupplier), sort, refine);
  const sortedSuppliers = sortSuppliers(filterSuppliers(suppliers, filters, categories), sort, term);

  // Any filter, sort or tab change makes the stored page stale, so it falls back to page 1.
  const resetKey = JSON.stringify([tab, query, category, type, businessType, region, minPrice, maxPrice, maxMoq, sort]);
  const requestedPage = pageState.key === resetKey ? pageState.page : 1;
  const productPage = paginate(sortedProducts, requestedPage, PAGE_SIZE);
  const supplierPage = paginate(sortedSuppliers, requestedPage, PAGE_SIZE);
  const current = tab === "products" ? productPage : supplierPage;

  function goToPage(n: number) {
    setPageState({ key: resetKey, page: n });
    resultsRef.current?.scrollIntoView({ block: "start" });
  }
  function changeTab(next: Tab) {
    setTab(next);
    setSort("relevance");
  }
  // WAI-ARIA tabs: Left/Right wrap, Home/End jump to the ends. Selection follows focus.
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TAB_IDS.length - 1;
    let next = -1;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    changeTab(TAB_IDS[next]);
    tabRefs.current[next]?.focus();
  }

  const filtersActive =
    term !== "" ||
    category !== "all" ||
    type !== "all" ||
    businessType !== "all" ||
    region !== "all" ||
    minPrice !== "" ||
    maxPrice !== "" ||
    maxMoq !== "all";
  function clearFilters() {
    setQuery("");
    setCategory("all");
    setType("all");
    setBusinessType("all");
    setRegion("all");
    setMinPrice("");
    setMaxPrice("");
    setMaxMoq("all");
  }
  function openProduct(p: Product) {
    setSelected(p);
    setOpen(true);
  }

  const top = categories.filter((c) => c.parentSlug === null);
  const activeCategory = categories.find((c) => c.slug === category);
  const activeTop = activeCategory?.parentSlug ? activeCategory.parentSlug : activeCategory?.slug;
  const topCategory = categories.find((c) => c.slug === activeTop);
  const childCategory = activeCategory?.parentSlug ? activeCategory : undefined;
  const selectedSupplier = selected ? bySupplier.get(selected.supplierId) : undefined;
  const sortOptions = tab === "products" ? PRODUCT_SORTS : SUPPLIER_SORTS;

  const crumb = (slug: string, text: string) => (
    <Link
      href={slug === "all" ? "/marketplace" : `/marketplace?category=${slug}`}
      className="hover:underline"
    >
      {text}
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <Link href="/" className="hover:underline">
              Home
            </Link>{" "}
            / {topCategory ? crumb("all", "Marketplace") : <span aria-current="page">Marketplace</span>}
            {topCategory && (
              <>
                {" "}
                /{" "}
                {childCategory ? (
                  crumb(topCategory.slug, topCategory.name)
                ) : (
                  <span aria-current="page">{topCategory.name}</span>
                )}
              </>
            )}
            {childCategory && (
              <>
                {" "}
                / <span aria-current="page">{childCategory.name}</span>
              </>
            )}
          </nav>
          <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">
            {initialQuery.trim() ? `“${initialQuery.trim()}”` : (activeCategory?.name ?? "All products")}
          </h1>
          <p className="text-xs text-muted-foreground">Unit prices are indicative only.</p>
        </div>
        <Link href="/buyer/rfqs/new" className={buttonVariants()}>
          Request quotations
        </Link>
      </header>

      <div role="tablist" aria-label="Result type" className="mb-4 flex gap-1 border-b">
        {(
          [
            ["products", `Products (${qty(sortedProducts.length)})`],
            ["suppliers", `Suppliers (${qty(sortedSuppliers.length)})`],
          ] as [Tab, string][]
        ).map(([id, text], index) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            aria-controls="results-panel"
            onClick={() => changeTab(id)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <div className="min-w-0 lg:contents">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters
          </Button>
          <aside
            id="filters"
            aria-label="Filters"
            className={cn(
              filtersOpen ? "block" : "hidden",
              "mt-2 rounded-lg border bg-card p-3 text-sm self-start lg:sticky lg:top-[var(--header-h)] lg:mt-0 lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto",
            )}
          >
            <section className="flex flex-col gap-1 pb-3">
              <h2 className="px-2 pb-1 text-sm font-semibold">Category</h2>
              <Button
                variant={category === "all" ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
              >
                All categories
              </Button>
              {top.map((c) => (
                <div key={c.slug} className="flex flex-col gap-1">
                  <Button
                    variant={category === c.slug ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start"
                    aria-pressed={category === c.slug}
                    onClick={() => setCategory(c.slug)}
                  >
                    {c.name}
                  </Button>
                  {activeTop === c.slug &&
                    categories
                      .filter((child) => child.parentSlug === c.slug)
                      .map((child) => (
                        <Button
                          key={child.slug}
                          variant={category === child.slug ? "secondary" : "ghost"}
                          size="sm"
                          className="justify-start pl-6 text-muted-foreground"
                          aria-pressed={category === child.slug}
                          onClick={() => setCategory(child.slug)}
                        >
                          {child.name}
                        </Button>
                      ))}
                </div>
              ))}
            </section>
            {tab === "products" && (
              <fieldset className="border-t py-3">
                <legend className="pb-1 text-sm font-semibold">Listing type</legend>
                <div className="flex flex-col gap-1">
                  {LISTING_OPTIONS.map(([value, text]) => (
                    <label key={value} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="listingType"
                        value={value}
                        checked={type === value}
                        onChange={() => setType(value)}
                      />
                      {text}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <section className="border-t py-3">
              <Field label="Business type" name="businessType">
                <NativeSelect
                  id="businessType"
                  name="businessType"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                >
                  <option value="all">All</option>
                  {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map((k) => (
                    <option key={k} value={k}>
                      {BUSINESS_TYPE_LABEL[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </section>
            <section className={cn("border-t py-3", tab === "suppliers" && "pb-0")}>
              <Field label="Location" name="region">
                <NativeSelect id="region" name="region" value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="all">All locations</option>
                  {provinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </section>
            {tab === "products" && (
              <>
                <fieldset className="border-t py-3">
                  <legend className="pb-1 text-sm font-semibold">Price range, PHP</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Min" name="minPrice">
                      <Input
                        id="minPrice"
                        name="minPrice"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                      />
                    </Field>
                    <Field label="Max" name="maxPrice">
                      <Input
                        id="maxPrice"
                        name="maxPrice"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                      />
                    </Field>
                  </div>
                </fieldset>
                <section className="border-t py-3">
                  <Field label="Maximum MOQ" name="maxMoq">
                    <NativeSelect id="maxMoq" name="maxMoq" value={maxMoq} onChange={(e) => setMaxMoq(e.target.value)}>
                      {MOQ_OPTIONS.map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </section>
              </>
            )}
            <div className="border-t pt-3">
              <Button variant="outline" size="sm" className="w-full" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </aside>
        </div>

        <div ref={resultsRef} className="flex min-w-0 scroll-mt-[var(--header-h)] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
            <Input
              id="q"
              name="q"
              type="search"
              aria-label="Search within results"
              className="w-full sm:max-w-xs"
              maxLength={140}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search within results"
            />
            <p>
              <strong>{qty(current.total)}</strong> {tab === "products" ? "listing" : "supplier"}
              {current.total === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="sort" className="text-xs text-muted-foreground">
                Sort by
              </label>
              <NativeSelect
                id="sort"
                name="sort"
                className="w-auto"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                {sortOptions.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </NativeSelect>
              {tab === "products" && (
                <div className="flex gap-1">
                  <Button
                    variant={view === "grid" ? "secondary" : "outline"}
                    size="icon-sm"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <LayoutGridIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant={view === "list" ? "secondary" : "outline"}
                    size="icon-sm"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <ListIcon aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div id="results-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
            {current.total > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Showing {qty(current.from)}–{qty(current.to)} of {qty(current.total)}
                </p>
                {tab === "products" ? (
                  <div
                    className={
                      view === "grid"
                        ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
                        : "flex flex-col gap-3"
                    }
                  >
                    {productPage.items.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        supplier={bySupplier.get(p.supplierId)}
                        layout={view}
                        onQuickView={() => openProduct(p)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {supplierPage.items.map((s) => (
                      <SupplierCard
                        key={s.id}
                        supplier={s}
                        mainProducts={products
                          .filter((p) => p.supplierId === s.id)
                          .slice(0, 3)
                          .map((p) => p.title)}
                      />
                    ))}
                  </div>
                )}
                <Pagination page={current.page} totalPages={current.totalPages} onPage={goToPage} />
              </>
            ) : (
              <EmptyState
                title={tab === "products" ? "Nothing matches those filters yet." : "No suppliers match those filters yet."}
              >
                <p>
                  {tab === "products"
                    ? "Try another search, change the MOQ, price or location, or submit a new sourcing request."
                    : "Try another search, change the business type or location, or submit a new sourcing request."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={clearFilters} disabled={!filtersActive}>
                    Clear filters
                  </Button>
                  <Link href="/buyer/rfqs/new" className={buttonVariants()}>
                    Create an RFQ
                  </Link>
                </div>
              </EmptyState>
            )}
          </div>

          <Notice>
            Supplier listings and prices reflect information submitted to TULAY. Listings do not guarantee inventory,
            pricing, suitability, delivery, or supplier performance.
          </Notice>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                  Supplier {selected.listingType === "service" ? "service" : "product"} listing
                </span>
                <DialogTitle className="text-lg">{selected.title}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1 rounded-lg border p-3">
                <Row k="Listing type" v={selected.listingType === "service" ? "Service" : "Product"} />
                <Row k="Supplier" v={selectedSupplier?.businessName} />
                <Row
                  k="Location"
                  v={selectedSupplier ? `${selectedSupplier.city}, ${selectedSupplier.province}` : undefined}
                />
                <Row k="Minimum order" v={`${qty(selected.moq)} ${selected.unit}`} />
                <Row
                  k="Indicative unit price"
                  v={
                    selected.indicativePriceCentavos === null
                      ? "Ask supplier"
                      : `${php(selected.indicativePriceCentavos)} / ${selected.unit}`
                  }
                />
                <Row k="Lead days" v={selected.leadDays === null ? "To confirm" : `${selected.leadDays} days`} />
                <Row k="Return class" v={<span className="capitalize">{label(selected.returnClass)}</span>} />
              </div>
              <Notice>This is not an instant checkout yet. Send a request and suppliers quote you.</Notice>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/buyer/rfqs/new?product=${selected.id}`}
                  className={cn(buttonVariants(), "flex-1")}
                >
                  Request quote for this product
                </Link>
                <Link
                  href={`/products/${selected.id}`}
                  className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
                >
                  View full details
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
