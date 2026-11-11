"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/common";
import { BUSINESS_TYPE_LABEL } from "@/components/supplier-card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPARE_KEY, COMPARE_MAX, useIdList } from "@/lib/saved";
import type { Product, Supplier } from "@/lib/types";
import { label, php, qty } from "@/lib/format";

export function CompareClient({
  products,
  suppliers,
  categories,
}: {
  products: Product[];
  suppliers: Supplier[];
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const param = useSearchParams().get("ids");
  const stored = useIdList(COMPARE_KEY);

  const wanted = param !== null ? param.split(",") : stored.ids;
  const picked = [...new Set(wanted)]
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => p !== undefined)
    .slice(0, COMPARE_MAX);

  const remove = (id: string) => {
    if (stored.has(id)) stored.toggle(id);
    const rest = picked.filter((p) => p.id !== id).map((p) => p.id);
    router.replace(rest.length ? `/compare?ids=${rest.join(",")}` : "/compare");
  };

  const supplierOf = (p: Product) => suppliers.find((s) => s.id === p.supplierId);
  const rows: { name: string; cell: (p: Product, s: Supplier | undefined) => React.ReactNode }[] = [
    {
      name: "Price",
      cell: (p) =>
        p.indicativePriceCentavos === null ? "Ask for price" : `${php(p.indicativePriceCentavos)} / ${p.unit}`,
    },
    { name: "Min. order", cell: (p) => `${qty(p.moq)} ${p.unit}` },
    { name: "Lead time", cell: (p) => (p.leadDays === null ? "To confirm" : `${p.leadDays} days`) },
    { name: "Category", cell: (p) => categories.find((c) => c.slug === p.categorySlug)?.name ?? p.categorySlug },
    { name: "Listing type", cell: (p) => <span className="capitalize">{p.listingType}</span> },
    { name: "Returns", cell: (p) => <span className="capitalize">{label(p.returnClass)}</span> },
    {
      name: "Supplier",
      cell: (_, s) =>
        s ? (
          <Link href={`/suppliers/${s.id}`} className="text-primary hover:underline">
            {s.businessName}
          </Link>
        ) : (
          "Unavailable"
        ),
    },
    { name: "Location", cell: (_, s) => (s ? `${s.city}, ${s.province}` : "") },
    { name: "Business type", cell: (_, s) => (s ? BUSINESS_TYPE_LABEL[s.businessType] : "") },
    {
      name: "Request a quote",
      cell: (p) => (
        <Link href={`/buyer/rfqs/new?product=${p.id}`} className={buttonVariants({ size: "sm" })}>
          Request a quote
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Compare products" description={`Up to ${COMPARE_MAX} products side by side.`} />
      {picked.length < 2 ? (
        <EmptyState title="Pick at least 2 products to compare.">
          <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
            Browse the marketplace
          </Link>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="sr-only">Attribute</span>
                </TableHead>
                {picked.map((p) => (
                  <TableHead key={p.id} scope="col" className="min-w-48 align-top whitespace-normal">
                    <Link href={`/products/${p.id}`} className="block font-semibold text-foreground hover:underline">
                      {p.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="mt-1 text-xs font-normal text-muted-foreground hover:underline"
                    >
                      Remove<span className="sr-only"> {p.title}</span>
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableHead scope="row" className="font-medium">
                    {r.name}
                  </TableHead>
                  {picked.map((p) => (
                    <TableCell key={p.id} className="whitespace-normal">
                      {r.cell(p, supplierOf(p))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
