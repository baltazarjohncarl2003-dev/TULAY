"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState, useTransition } from "react";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { CategoryChips } from "@/components/category-chips";
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
import { inCategory } from "@/lib/categories";
import type { BusinessType, Category, Product, Supplier } from "@/lib/types";
import { sentence, php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type ListingFilter,
  MOQ_OPTIONS,
  type MarketplaceParams,
  PRODUCT_SORTS,
  SUPPLIER_SORTS,
  type Sort,
  type Tab,
  marketplaceSearch,
  pesosToCentavos,
} from "./params";

const PAGE_SIZE = 12;
const TAB_IDS: Tab[] = ["products", "suppliers"];
const LISTING_OPTIONS: [ListingFilter, string][] = [
  ["all", "All"],
  ["product", "Products"],
  ["service", "Services"],
];

export { pesosToCentavos };

type Hit = { product: Product; supplier: Supplier };

// ---- Pure logic: supplier filter, sort, paginate (products are filtered by the server) ----

function filterSuppliers(
  suppliers: Supplier[],
  f: { term: string; category: string; businessType: string; region: string },
  viaProducts: Set<string> | null,
): Supplier[] {
  return suppliers.filter((s) => {
    if (
      f.term &&
      !viaProducts?.has(s.id) &&
      ![s.businessName, s.description, s.keywords].join(" ").toLowerCase().includes(f.term)
    )
      return false;
    if (!inCategory(s.categorySlug, f.category)) return false;
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

type Props = {
  params: MarketplaceParams;
  hits: Hit[];
  total: number;
  page: number;
  suppliers: Supplier[];
  categories: Category[];
  supplierIdsForQuery: string[] | null;
  supplierTitles: Record<string, string[]>;
};

export function Pagination({
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

export function MarketplaceClient({
  params,
  hits,
  total,
  page,
  suppliers,
  categories,
  supplierIdsForQuery,
  supplierTitles,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const { category, type, tab, businessType, region, maxMoq, sort, view } = params;
  // Text boxes keep local state and apply after a pause; they re-sync when the URL value changes.
  const [query, setQuery] = useState(params.q);
  const [minPrice, setMinPrice] = useState(params.minPrice);
  const [maxPrice, setMaxPrice] = useState(params.maxPrice);
  const [synced, setSynced] = useState(params);
  if (synced !== params) {
    setSynced(params);
    if (params.q !== synced.q) setQuery(params.q);
    if (params.minPrice !== synced.minPrice) setMinPrice(params.minPrice);
    if (params.maxPrice !== synced.maxPrice) setMaxPrice(params.maxPrice);
  }
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typed = useRef<Partial<MarketplaceParams>>({});
  useEffect(() => () => clearTimeout(timer.current), []);

  const provinces = [...new Set(suppliers.map((s) => s.province.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  const term = params.q.toLowerCase();
  const viaProducts = supplierIdsForQuery ? new Set(supplierIdsForQuery) : null;
  const sortedSuppliers = sortSuppliers(
    filterSuppliers(suppliers, { term, category, businessType, region }, viaProducts),
    sort,
    term,
  );
  const productTotalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const supplierPage = paginate(sortedSuppliers, params.page, PAGE_SIZE);
  const current =
    tab === "products"
      ? {
          page,
          totalPages: productTotalPages,
          total,
          from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
          to: Math.min(page * PAGE_SIZE, total),
        }
      : supplierPage;

  // Every control navigates to the new URL; the server returns the filtered, sorted page. Any change but the
  // page or the view starts again at page 1. A new category is a history entry, so Back returns to the previous one.
  function go(patch: Partial<MarketplaceParams>, push = false) {
    const next = { ...params, page: 1, ...patch };
    const qs = marketplaceSearch(next);
    if (qs === marketplaceSearch(params)) return;
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    });
  }
  /** Text input: apply on Enter (now) or 500 ms after the last keystroke. Patches typed meanwhile are merged. */
  function applyTyped(patch: Partial<MarketplaceParams>, now = false) {
    typed.current = { ...typed.current, ...patch };
    clearTimeout(timer.current);
    const run = () => {
      const p = typed.current;
      typed.current = {};
      go(p);
    };
    if (now) run();
    else timer.current = setTimeout(run, 500);
  }
  const wholePesos = (v: string) => (pesosToCentavos(v) === null ? "" : v.trim());

  function goToPage(n: number) {
    go({ page: n });
    resultsRef.current?.scrollIntoView({ block: "start" });
  }
  function changeTab(next: Tab) {
    go({ tab: next, sort: "relevance" });
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

  // The search text (q) is not a filter: Clear filters keeps it, as well as the tab, sort and view.
  const filtersActive =
    category !== "all" ||
    type !== "all" ||
    businessType !== "all" ||
    region !== "all" ||
    params.minPrice !== "" ||
    params.maxPrice !== "" ||
    maxMoq !== "all";
  function clearFilters() {
    go({ category: "all", type: "all", businessType: "all", region: "all", minPrice: "", maxPrice: "", maxMoq: "all" });
  }
  function openProduct(p: Product) {
    setSelected(p);
    setOpen(true);
  }

  const activeCategory = categories.find((c) => c.slug === category);
  const activeTop = activeCategory?.parentSlug ? activeCategory.parentSlug : activeCategory?.slug;
  const topCategory = categories.find((c) => c.slug === activeTop);
  const childCategory = activeCategory?.parentSlug ? activeCategory : undefined;
  const selectedSupplier = selected ? hits.find((h) => h.product.id === selected.id)?.supplier : undefined;
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
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
          <h1 className="text-title tracking-tight break-words">
            {params.q ? `“${params.q}”` : (activeCategory?.name ?? "All Products")}
          </h1>
          <p className="text-xs text-muted-foreground">Unit prices are indicative only.</p>
        </div>
        <Link href="/buyer/rfqs/new" className={buttonVariants()}>
          Request Quotations
        </Link>
      </header>

      <div role="tablist" aria-label="Result type" className="mb-4 flex gap-1 border-b">
        {(
          [
            ["products", `Products (${qty(total)})`],
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

      <div className="mb-4">
        <CategoryChips categories={categories} value={category} onChange={(slug) => go({ category: slug }, true)} />
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
              "mt-2 rounded-lg border bg-card p-3 text-sm self-start [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0 lg:sticky lg:top-[var(--header-h)] lg:mt-0 lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto",
            )}
          >
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
                        onChange={() => go({ type: value })}
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
                  onChange={(e) => go({ businessType: e.target.value })}
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
                <NativeSelect id="region" name="region" value={region} onChange={(e) => go({ region: e.target.value })}>
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
                        onChange={(e) => {
                          setMinPrice(e.target.value);
                          applyTyped({ minPrice: wholePesos(e.target.value) });
                        }}
                        onKeyDown={(e) => e.key === "Enter" && applyTyped({ minPrice: wholePesos(minPrice) }, true)}
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
                        onChange={(e) => {
                          setMaxPrice(e.target.value);
                          applyTyped({ maxPrice: wholePesos(e.target.value) });
                        }}
                        onKeyDown={(e) => e.key === "Enter" && applyTyped({ maxPrice: wholePesos(maxPrice) }, true)}
                      />
                    </Field>
                  </div>
                </fieldset>
                <section className="border-t py-3">
                  <Field label="Maximum MOQ" name="maxMoq">
                    <NativeSelect id="maxMoq" name="maxMoq" value={maxMoq} onChange={(e) => go({ maxMoq: e.target.value })}>
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
              aria-label="Search the marketplace"
              className="w-full sm:max-w-xs"
              maxLength={140}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                applyTyped({ q: e.target.value.trim() });
              }}
              onKeyDown={(e) => e.key === "Enter" && applyTyped({ q: query.trim() }, true)}
              placeholder="Search the marketplace"
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
                onChange={(e) => go({ sort: e.target.value as Sort })}
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
                    onClick={() => go({ view: "grid", page: params.page })}
                  >
                    <LayoutGridIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant={view === "list" ? "secondary" : "outline"}
                    size="icon-sm"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => go({ view: "list", page: params.page })}
                  >
                    <ListIcon aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div
            id="results-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            aria-busy={pending || undefined}
            className={cn("flex flex-col gap-4 transition-opacity", pending && "opacity-60")}
          >
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
                    {hits.map((h) => (
                      <ProductCard
                        key={h.product.id}
                        product={h.product}
                        supplier={h.supplier}
                        layout={view}
                        onQuickView={() => openProduct(h.product)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {supplierPage.items.map((s) => (
                      <SupplierCard
                        key={s.id}
                        supplier={s}
                        mainProducts={supplierTitles[s.id] ?? []}
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
                <Row k="Return class" v={sentence(selected.returnClass)} />
              </div>
              <Notice>Buy at listed prices, or request a quote for custom terms.</Notice>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/messages?supplier=${selected.supplierId}&product=${selected.id}`}
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
