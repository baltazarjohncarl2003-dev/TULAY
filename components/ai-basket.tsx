"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { addToCart } from "@/lib/actions/orders";
import { php, qty } from "@/lib/format";
import type { BasketLine, BasketOption } from "@/lib/matching/basket";
import { unitPriceFor } from "@/lib/pricing";

type LineState = { productId: string; variantId: string; included: boolean };

const keyOf = (line: BasketLine) => line.need.text.toLowerCase();

/** Display price for an option, optionally with a chosen variant. The server reprices at checkout. */
function priced(option: BasketOption, variantId: string) {
  const variant = option.product.variants?.find((v) => v.id === variantId);
  const unit = variant
    ? unitPriceFor(option.product.indicativePriceCentavos, option.product.priceTiers ?? [], option.quantity, variant.priceDeltaCentavos)
    : option.unitCentavos;
  return { unit, line: unit === null ? 0 : unit * option.quantity };
}

export function AiBasket({ lines, budgetCentavos = null }: { lines: BasketLine[]; budgetCentavos?: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<Record<string, LineState>>({});
  const [adding, setAdding] = useState(false);

  // Derived each render: a stored choice is kept only while its product is still among the options.
  const rows = lines.map((line) => {
    const stored = state[keyOf(line)];
    const kept = stored && line.options.some((o) => o.product.id === stored.productId) ? stored : null;
    const first = line.options[0];
    const s: LineState = kept ?? {
      productId: first?.product.id ?? "",
      variantId: "",
      included: !!first && first.blockers.length === 0,
    };
    const option = line.options.find((o) => o.product.id === s.productId) ?? null;
    const variants = option?.product.variants ?? [];
    return { line, s, option, variants, included: !!option && s.included, price: option ? priced(option, s.variantId) : null };
  });

  function update(row: (typeof rows)[number], patch: Partial<LineState>) {
    setState((prev) => ({ ...prev, [keyOf(row.line)]: { ...row.s, ...patch } }));
  }

  const chosen = rows.filter((r) => r.included);
  const total = chosen.reduce((sum, r) => sum + (r.price?.line ?? 0), 0);
  const needsOption = chosen.some((r) => r.variants.length > 0 && !r.s.variantId);

  async function addAll() {
    setAdding(true);
    let added = 0;
    for (const row of chosen) {
      if (!row.option) continue;
      const { product, quantity } = row.option;
      let res;
      try {
        res = await addToCart({ productId: product.id, variantId: row.s.variantId, quantity });
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
        continue;
      }
      if (res.ok) {
        added++;
        update(row, { included: false });
      } else if (res.unauthenticated) {
        router.push(`/login?next=${encodeURIComponent(`${pathname}?${searchParams.toString()}`)}`);
        setAdding(false);
        return;
      } else {
        toast.error(`${product.title}: ${res.error}`);
      }
    }
    setAdding(false);
    if (added > 0 && added === chosen.length) {
      toast.success(`Added ${added} ${added === 1 ? "item" : "items"} to your cart`, {
        action: { label: "View cart", onClick: () => router.push("/buyer/cart") },
      });
    }
    if (added > 0) router.refresh();
  }

  return (
    <section aria-label="Proposed basket" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const { line, s, option, variants, price } = row;
          const id = `basket-${keyOf(line).replace(/\W+/g, "-")}`;
          const index = line.options.findIndex((o) => o.product.id === s.productId);
          return (
            <li key={keyOf(line)} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-heading first-letter:uppercase">{line.need.text}</h3>
                {line.need.quantity !== null && <Badge variant="secondary">Qty {qty(line.need.quantity)}</Badge>}
                {line.need.preference === "fastest" && <Badge variant="secondary">Fastest</Badge>}
              </div>

              {!option ? (
                <>
                  <p className="text-sm text-muted-foreground">No priced listing matches this yet.</p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/buyer/rfqs/new?need=${encodeURIComponent(line.need.text)}`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Request Quotes
                    </Link>
                    <Link
                      href={`/marketplace?q=${encodeURIComponent(line.need.text)}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      See All Results
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5 text-sm">
                    <Link href={`/products/${option.product.id}`} className="font-medium hover:underline">
                      {option.product.title}
                    </Link>
                    <span className="text-muted-foreground">
                      {option.supplier.businessName}, {option.supplier.city}
                    </span>
                    <span>
                      {price?.unit == null
                        ? "Price on request"
                        : `${option.fromPrice && !s.variantId ? "from " : ""}${php(price.unit)} × ${qty(option.quantity)} = ${php(price.line)}`}
                    </span>
                    {option.reasons.length > 0 && (
                      <span className="text-xs text-muted-foreground">{option.reasons.join(" · ")}</span>
                    )}
                    {option.blockers.map((b) => (
                      <span key={b} className="text-xs text-destructive">
                        {b}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={s.included}
                        onChange={(e) => update(row, { included: e.target.checked })}
                      />
                      Include
                    </label>
                    {line.options.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update(row, {
                            productId: line.options[(index + 1) % line.options.length].product.id,
                            variantId: "",
                          })
                        }
                      >
                        Swap (Option {index + 1} of {line.options.length})
                      </Button>
                    )}
                    {variants.length > 0 && (
                      <>
                        <label htmlFor={id} className="sr-only">
                          Choose an option for {option.product.title}
                        </label>
                        <NativeSelect
                          id={id}
                          className="w-auto"
                          value={s.variantId}
                          onChange={(e) => update(row, { variantId: e.target.value })}
                        >
                          <option value="">Choose an option</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.priceDeltaCentavos === 0
                                ? v.name
                                : `${v.name} (${v.priceDeltaCentavos > 0 ? "+" : ""}${php(v.priceDeltaCentavos)})`}
                            </option>
                          ))}
                        </NativeSelect>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-sm font-semibold">
          Total for {chosen.length} {chosen.length === 1 ? "item" : "items"}:{" "}
          <span className={budgetCentavos !== null && total > budgetCentavos ? "text-destructive" : undefined}>{php(total)}</span>
          {budgetCentavos !== null && <span className="font-normal text-muted-foreground"> of your {php(budgetCentavos)} budget</span>}
        </p>
        {needsOption && <p className="text-xs text-muted-foreground">Choose an option for every included item.</p>}
        <Button type="button" disabled={chosen.length === 0 || adding || needsOption} onClick={addAll} className="self-start">
          Add {chosen.length} {chosen.length === 1 ? "item" : "items"} to cart
        </Button>
      </div>
    </section>
  );
}
