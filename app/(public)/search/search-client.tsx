"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { SparklesIcon } from "lucide-react";
import { Notice, PageHeader } from "@/components/common";
import { ProductCard } from "@/components/product-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBudgetCentavos, splitNeeds } from "@/lib/matching/needs";
import { smartSearch } from "@/lib/matching/search";
import type { Product, Supplier } from "@/lib/demo/types";
import { php } from "@/lib/format";

const MAX_LENGTH = 1000;
const TOP_HITS = 4;
const PROMPTS = [
  "Starting a café: disposable cups, coffee beans, POS terminal, budget ₱100,000",
  "Online shop packaging: 500 mailer boxes and thermal labels",
  "Office setup for 10 staff: desks, laptops, bond paper",
  "Hotel opening: amenity kits, uniforms, kitchenware",
];

export function SearchClient({ products, suppliers }: { products: Product[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("q") ?? "").slice(0, MAX_LENGTH).trim();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);

  const needs = useMemo(
    () =>
      splitNeeds(submitted).map((need) => ({
        need,
        hits: smartSearch(need.text, products, suppliers).hits.slice(0, TOP_HITS),
      })),
    [submitted, products, suppliers],
  );
  const budget = useMemo(() => parseBudgetCentavos(submitted), [submitted]);

  function runSearch(text: string) {
    const clean = text.trim().slice(0, MAX_LENGTH);
    setDraft(clean);
    setSubmitted(clean);
    router.replace(clean ? `/search?q=${encodeURIComponent(clean)}` : "/search", { scroll: false });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    runSearch(draft);
  }

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            TULAY AI <Badge variant="secondary">Preview</Badge>
          </span>
        }
        description="Describe what your business needs. We split it into separate needs and match each one to listings."
      />

      <Notice>
        Preview: matching is rule-based on sample listings, not an AI model yet. Recommendations explain why they
        matched. Always confirm details with the supplier.
      </Notice>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Label htmlFor="needs-request">What does your business need?</Label>
        <Textarea
          id="needs-request"
          name="q"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="Example: I need 500 custom shirts, printed boxes and a POS terminal. Budget ₱100,000."
        />
        <div>
          <Button type="submit">
            <SparklesIcon /> Find matches
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <Button key={p} type="button" variant="outline" size="sm" onClick={() => runSearch(p)}>
            {p}
          </Button>
        ))}
      </div>

      {submitted && needs.length === 0 && (
        <p className="text-sm text-muted-foreground">Try listing items separated by commas.</p>
      )}

      {budget !== null && (
        <p className="text-sm">
          Budget noted: {php(budget)}{" "}
          <span className="text-muted-foreground">Not used for filtering in this preview.</span>
        </p>
      )}

      {needs.map(({ need, hits }) => (
        <Card key={need.text}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg leading-snug font-medium">{need.text}</h2>
              {need.quantity !== null && <Badge variant="secondary">Qty {need.quantity}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No listings match this yet.</p>
            ) : (
              hits.map(({ product, supplier, reasons }) => (
                <div key={product.id} className="flex flex-col gap-2">
                  <ProductCard product={product} supplier={supplier} layout="list" />
                  {reasons.length > 0 && (
                    <div className="text-sm">
                      <p className="font-medium">Why this matched</p>
                      <ul className="list-disc pl-5 text-muted-foreground">
                        {reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Link
              href={`/buyer/rfqs/new?need=${encodeURIComponent(need.text)}`}
              className={buttonVariants({ size: "sm" })}
            >
              Draft an RFQ for this
            </Link>
            <Link
              href={`/marketplace?q=${encodeURIComponent(need.text)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              See all results
            </Link>
          </CardFooter>
        </Card>
      ))}
    </>
  );
}
