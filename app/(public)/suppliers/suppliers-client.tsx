"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, Notice, PageHeader } from "@/components/common";
import { Field, NativeSelect } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { categoryName } from "@/lib/demo/data";
import type { Supplier } from "@/lib/demo/types";
import { qty } from "@/lib/format";

/** Keyed on ?q= so a new header search resets the list, like the marketplace. */
export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const q = useSearchParams().get("q") ?? "";
  return <SupplierList key={q} suppliers={suppliers} initialQuery={q} />;
}

function SupplierList({ suppliers, initialQuery }: { suppliers: Supplier[]; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [province, setProvince] = useState("all");

  const provinces = [...new Set(suppliers.map((s) => s.province.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const q = query.trim().toLowerCase();
  const list = suppliers
    .filter((s) => province === "all" || s.province === province)
    .filter(
      (s) =>
        !q ||
        [s.businessName, categoryName(s.categorySlug), s.city, s.province, s.description]
          .join(" ")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
  const filtered = q !== "" || province !== "all";

  function clearFilters() {
    setQuery("");
    setProvince("all");
  }

  return (
    <>
      <PageHeader
        eyebrow="Grow your supplier network"
        title="Meet your next business partner."
        description="Browse companies approved for listing by TULAY's administrators. Administrative approval does not constitute independent certification."
        actions={
          <Link href="/login?role=buyer" className={buttonVariants()}>
            Get quotations
          </Link>
        }
      />

      <div role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          name="q"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={140}
          aria-label="Search supplier directory"
          placeholder="Search a business, product, city, or capability..."
          className="flex-1"
        />
        <Field label="Province or region" name="province" className="sm:w-64">
          <NativeSelect id="province" name="province" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="all">All regions</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </Field>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <Card key={s.id}>
              <CardHeader className="gap-3">
                <Badge variant="secondary" className="w-fit">
                  Admin-approved listing
                </Badge>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
                  >
                    {s.businessName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold leading-tight">{s.businessName}</h2>
                    <p className="text-sm text-muted-foreground">{categoryName(s.categorySlug)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm">
                  {s.description || "Business capability details will be confirmed by the supplier."}
                </p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <li>{[s.city, s.province].filter(Boolean).join(", ")}</li>
                  <li>MOQ: {qty(s.moq)}</li>
                  <li>Lead time: {s.leadDays} days, indicative</li>
                </ul>
              </CardContent>
              <CardFooter className="flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Published business information</span>
                <Link href="/login?role=buyer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Submit RFQ
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={suppliers.length ? "No suppliers matched your search." : "Published supplier profiles are coming."}>
          <p>
            {suppliers.length
              ? "Try a broader search or all regions."
              : "Companies appear here only after administrative approval. You can still prepare a sourcing request."}
          </p>
          <Link href="/login?role=buyer" className={buttonVariants({ size: "sm" })}>
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
