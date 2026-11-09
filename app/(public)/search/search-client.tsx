"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { EmptyState, Notice, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { smartSearch } from "@/lib/demo/search";
import type { Product, Supplier } from "@/lib/demo/types";
import { php, qty } from "@/lib/format";

const MAX_LENGTH = 240;
const EXAMPLES = ["5,000 printed coffee pouches", "500 custom shirts for our team", "custom shipping boxes"];

export function SearchClient({ products, suppliers }: { products: Product[]; suppliers: Supplier[] }) {
  const params = useSearchParams();
  const initial = (params.get("q") ?? "").slice(0, MAX_LENGTH).trim();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const result = useMemo(
    () => (submitted ? smartSearch(submitted, products, suppliers) : null),
    [submitted, products, suppliers],
  );

  function runSearch(text: string) {
    const clean = text.trim().slice(0, MAX_LENGTH);
    setDraft(clean);
    setSubmitted(clean);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    runSearch(draft);
  }

  return (
    <>
      <PageHeader
        eyebrow="Automated supplier search"
        title="Tell us what you need. Discover matching suppliers."
        description="Real supplier listings are ranked automatically using product descriptions, quantity and location. Listings are not guaranteed inventory or delivery promises."
      />

      <form onSubmit={onSubmit} noValidate role="search" className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="q"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="Example: I need 500 custom shirts for our team"
          aria-label="Describe what you want to source"
          className="flex-1"
        />
        <Button type="submit">Find matches</Button>
      </form>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Try a natural-language product search</CardTitle>
            <CardDescription>Describe the quantity and the product in plain words. Examples:</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <Button key={ex} type="button" variant="outline" size="sm" onClick={() => runSearch(ex)}>
                  “{ex}”
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Results come only from approved, real supplier product listings, not invented supplier profiles.
            </p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <Notice>
            <strong>We understood:</strong>{" "}
            {result.parsed.quantity !== null && <>Quantity: {qty(result.parsed.quantity)} · </>}
            {result.parsed.keywords.length > 0
              ? `Keywords: ${result.parsed.keywords.slice(0, 8).join(", ")}`
              : "Search terms required"}{" "}
            <span className="text-muted-foreground">· Refine your search anytime</span>
          </Notice>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">
              {result.total} matching supplier product listing{result.total === 1 ? "" : "s"}
            </h2>
            <Link href="/buyer/rfqs/new" className={buttonVariants({ variant: "outline" })}>
              Create RFQ
            </Link>
          </div>

          {result.hits.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {result.hits.map(({ product: p, supplier: s, score, reasons }) => (
                <Card key={p.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      <Badge variant="secondary">{score} / 100 relevance</Badge>
                    </div>
                    <CardDescription>
                      {s.businessName} · {s.city}, {s.province}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md bg-muted px-2 py-1 font-medium">
                        {p.indicativePriceCentavos === null
                          ? "Ask for price"
                          : `${php(p.indicativePriceCentavos)} / ${p.unit}`}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-1">MOQ {qty(p.moq)}</span>
                      <span className="rounded-md bg-muted px-2 py-1">
                        {p.leadDays === null ? "Lead time to confirm" : `${p.leadDays} days indicative`}
                      </span>
                    </div>
                    <p className="text-sm">{p.description}</p>
                    {reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {reasons.map((r) => (
                          <Badge key={r} variant="outline">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2">
                    <Link
                      href={`/marketplace?q=${encodeURIComponent(p.title)}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      View listing
                    </Link>
                    <Link href={`/buyer/rfqs/new?product=${p.id}`} className={buttonVariants({ size: "sm" })}>
                      Request quotes
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="No listing matches yet">
              <ul className="list-disc text-left">
                <li>Try broader keywords, such as “shirt” or “box”.</li>
                <li>Check the spelling, or drop very specific details.</li>
                <li>Still nothing? Describe the job in full in a sourcing request.</li>
              </ul>
              <Link href="/buyer/rfqs/new" className={buttonVariants({ size: "sm" })}>
                Create sourcing request
              </Link>
            </EmptyState>
          )}

          {result.more && (
            <p className="text-sm text-muted-foreground">
              Showing top matches. Refine your request to narrow the results.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Scores show search relevance, not supplier quality. Listings are not guaranteed inventory or delivery
            promises.
          </p>
        </>
      )}
    </>
  );
}
