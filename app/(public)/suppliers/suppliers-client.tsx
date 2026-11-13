"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, Notice, PageHeader } from "@/components/common";
import { NativeSelect } from "@/components/form";
import { BUSINESS_TYPE_LABEL, SupplierCard } from "@/components/supplier-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, Product, Supplier } from "@/lib/types";

type Props = { suppliers: Supplier[]; products: Product[]; categories: Category[] };

/** Keyed on ?q= so a new header search resets the list, like the marketplace. */
export function SuppliersClient(props: Props) {
  const q = useSearchParams().get("q") ?? "";
  return <SupplierList key={q} {...props} initialQuery={q} />;
}

function SupplierList({ suppliers, products, categories, initialQuery }: Props & { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [province, setProvince] = useState("all");

  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const topOf = (slug: string) => categories.find((c) => c.slug === slug)?.parentSlug ?? slug;
  const provinces = [...new Set(suppliers.map((s) => s.province.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const q = query.trim().toLowerCase();
  const list = suppliers
    .filter((s) => category === "all" || topOf(s.categorySlug) === category)
    .filter((s) => type === "all" || s.businessType === type)
    .filter((s) => province === "all" || s.province === province)
    .filter(
      (s) =>
        !q ||
        [s.businessName, catName(s.categorySlug), s.city, s.province, s.description]
          .join(" ")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
  const filtered = q !== "" || category !== "all" || type !== "all" || province !== "all";

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setType("all");
    setProvince("all");
  }

  return (
    <>
      <PageHeader title="Supplier directory" description="Approved businesses across the Philippines." />

      <div role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(3,12rem)]">
        <Input
          name="q"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={140}
          aria-label="Search supplier directory"
          placeholder="Search a business, product, city, or capability..."
          className="sm:col-span-2 lg:col-span-1"
        />
        <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories
            .filter((c) => c.parentSlug === null)
            .map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect aria-label="Business type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All business types</option>
          {Object.entries(BUSINESS_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Province" value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="all">All provinces</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <strong>
            {list.length} supplier{list.length === 1 ? "" : "s"} listed
          </strong>
          <span className="text-muted-foreground"> · {suppliers.length} published total</span>
        </p>
        {filtered && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {list.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              mainProducts={products.filter((p) => p.supplierId === s.id).slice(0, 3).map((p) => p.title)}
            />
          ))}
        </div>
      ) : (
        <EmptyState title={suppliers.length ? "No suppliers matched your search." : "Published supplier profiles are coming."}>
          <p>
            {suppliers.length
              ? "Try a broader search or all regions."
              : "Companies appear here only after administrative approval. You can still prepare a sourcing request."}
          </p>
          <Link href="/register?role=buyer" className={buttonVariants({ size: "sm" })}>
            Start sourcing
          </Link>
        </EmptyState>
      )}

      <Notice>
        TULAY does not guarantee the supplier&apos;s identity, quality, inventory, regulatory compliance, delivery time,
        or quoted commercial terms. Confirm important details independently before transacting.
      </Notice>
    </>
  );
}
