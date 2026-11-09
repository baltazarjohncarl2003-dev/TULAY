"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, Notice, PageHeader, Row } from "@/components/common";
import { Field, NativeSelect } from "@/components/form";
import { ProductCard } from "@/components/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Category, Product, Supplier } from "@/lib/demo/types";
import { label, php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sort = "featured" | "price" | "moq" | "supplier";

const MOQ_OPTIONS: [string, string][] = [
  ["all", "Any"],
  ["100", "100 or less"],
  ["500", "500 or less"],
  ["1000", "1,000 or less"],
  ["5000", "5,000 or less"],
];
const SORT_OPTIONS: [Sort, string][] = [
  ["featured", "Featured / latest"],
  ["price", "Indicative price"],
  ["moq", "Lowest MOQ"],
  ["supplier", "Supplier name"],
];

type Props = { products: Product[]; suppliers: Supplier[]; categories: Category[] };

/** Reads the URL once per query, so a new ?q= or ?category= starts the filters fresh. */
export function MarketplaceClient(props: Props) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "all";
  return <Catalog key={`${q}|${category}`} {...props} initialQuery={q} initialCategory={category} />;
}

function sortProducts(list: Product[], sort: Sort, supplierName: (p: Product) => string): Product[] {
  const sorted = [...list];
  switch (sort) {
    case "featured":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "price":
      // Nulls last: a product without an indicative price sorts after every priced one.
      return sorted.sort((a, b) => {
        const pa = a.indicativePriceCentavos;
        const pb = b.indicativePriceCentavos;
        if (pa === pb) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      });
    case "moq":
      return sorted.sort((a, b) => a.moq - b.moq);
    case "supplier":
      return sorted.sort((a, b) => supplierName(a).localeCompare(supplierName(b)));
  }
}

function Catalog({
  products,
  suppliers,
  categories,
  initialQuery,
  initialCategory,
}: Props & { initialQuery: string; initialCategory: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [region, setRegion] = useState("all");
  const [maxMoq, setMaxMoq] = useState("all");
  const [sort, setSort] = useState<Sort>("featured");
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const bySupplier = new Map(suppliers.map((s) => [s.id, s]));
  const supplierName = (p: Product) => bySupplier.get(p.supplierId)?.businessName ?? "";
  const provinces = [...new Set(suppliers.map((s) => s.province.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  // A parent category includes its children's products.
  const allowed = new Set([category, ...categories.filter((c) => c.parentSlug === category).map((c) => c.slug)]);
  const term = query.trim().toLowerCase();
  const filtered = products.filter((p) => {
    if (category !== "all" && !allowed.has(p.categorySlug)) return false;
    if (term && ![p.title, p.description, supplierName(p)].join(" ").toLowerCase().includes(term)) return false;
    if (maxMoq !== "all" && p.moq > Number(maxMoq)) return false;
    if (region !== "all" && bySupplier.get(p.supplierId)?.province !== region) return false;
    return true;
  });
  const visible = sortProducts(filtered, sort, supplierName);

  const filtersActive = term !== "" || category !== "all" || region !== "all" || maxMoq !== "all";
  function clearFilters() {
    setQuery("");
    setCategory("all");
    setRegion("all");
    setMaxMoq("all");
  }
  function openProduct(p: Product) {
    setSelected(p);
    setOpen(true);
  }

  const launch = categories.filter((c) => c.parentSlug === null);
  const selectedSupplier = selected ? bySupplier.get(selected.supplierId) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-12">
      <PageHeader
        eyebrow="The TULAY marketplace"
        title={
          <>
            Source more. <span className="text-primary">Grow bigger.</span>
          </>
        }
        description="Explore supplier-published products. Unit prices are indicative only."
        actions={
          <Link href="/buyer/rfqs/new" className={buttonVariants()}>
            Request quotations
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside aria-label="Product categories" className="flex flex-col gap-1">
          <h2 className="px-2 pb-1 text-sm font-semibold">Browse by category</h2>
          <Button
            variant={category === "all" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All categories
          </Button>
          {launch.map((c) => (
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
              {categories
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
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <Field label="Search products" name="q">
            <Input
              id="q"
              name="q"
              type="search"
              maxLength={140}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Boxes, custom pouches, stickers, food containers"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Region" name="region">
              <NativeSelect id="region" name="region" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="all">All regions</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Maximum MOQ" name="maxMoq">
              <NativeSelect id="maxMoq" name="maxMoq" value={maxMoq} onChange={(e) => setMaxMoq(e.target.value)}>
                {MOQ_OPTIONS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Sort by" name="sort">
              <NativeSelect id="sort" name="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORT_OPTIONS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              <strong>{qty(visible.length)}</strong> published supplier product{visible.length === 1 ? "" : "s"}
            </p>
            {filtersActive && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {visible.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  supplierName={supplierName(p)}
                  onView={() => openProduct(p)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing matches those filters yet.">
              <p>Try another search, change the MOQ or region, or submit a new sourcing request.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
                <Link href="/buyer/rfqs/new" className={buttonVariants()}>
                  Create an RFQ
                </Link>
              </div>
            </EmptyState>
          )}

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
                  Supplier product listing
                </span>
                <DialogTitle className="text-lg">{selected.title}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1 rounded-lg border p-3">
                <Row k="Supplier" v={selectedSupplier?.businessName} />
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
              <Link href={`/buyer/rfqs/new?product=${selected.id}`} className={cn(buttonVariants(), "w-full")}>
                Request quote for this product
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
