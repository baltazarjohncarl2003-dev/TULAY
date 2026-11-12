"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Field, NativeSelect, useServerAction } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addToCart } from "@/lib/actions/orders";
import { php, qty } from "@/lib/format";
import { unitPriceFor } from "@/lib/pricing";
import type { Product } from "@/lib/types";

/** Add to cart on the product page. The server re-checks MOQ, options and stock; these checks only give feedback. */
export function AddToCart({ product }: { product: Product }) {
  const { run, pending } = useServerAction();
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(String(product.moq));

  const variants = product.variants ?? [];
  const tiers = product.priceTiers ?? [];
  if (product.status !== "approved" || (product.indicativePriceCentavos === null && tiers.length === 0)) return null;

  const variant = variants.find((v) => v.id === variantId);
  const delta = variant?.priceDeltaCentavos ?? 0;
  const stock = variants.length > 0 ? (variant?.stock ?? null) : (product.stock ?? null);
  const q = Number(quantity);
  const qtyOk = Number.isInteger(q) && q >= product.moq;
  const unit = qtyOk ? unitPriceFor(product.indicativePriceCentavos, tiers, q, delta) : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (variants.length > 0 && !variantId) {
      toast.error("Choose an option.");
      return;
    }
    if (!qtyOk) {
      toast.error(`Minimum order is ${qty(product.moq)} ${product.unit}.`);
      return;
    }
    run(() => addToCart({ productId: product.id, variantId, quantity: q }), "Added to cart");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t pt-3">
      {variants.length > 0 && (
        <Field label="Option" name="variant">
          <NativeSelect id="variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">Choose an option</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.priceDeltaCentavos === 0
                  ? v.name
                  : `${v.name} (${v.priceDeltaCentavos > 0 ? "+" : ""}${php(v.priceDeltaCentavos)})`}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label="Quantity" name="quantity" hint={`Minimum order: ${qty(product.moq)} ${product.unit}`}>
        <Input
          id="quantity"
          type="number"
          inputMode="numeric"
          min={product.moq}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>
      <p className="text-sm">
        {!qtyOk
          ? `Enter at least ${qty(product.moq)} ${product.unit}.`
          : unit === null
            ? "Price on request for this quantity."
            : `${php(unit)} per unit · ${php(unit * q)} total`}
      </p>
      {stock !== null && (
        <p className={qtyOk && q > stock ? "text-sm text-amber-700" : "text-sm text-muted-foreground"}>Only {qty(stock)} left</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          Add to cart
        </Button>
        <Link href="/buyer/cart" className={buttonVariants({ variant: "outline" })}>
          View cart
        </Link>
      </div>
    </form>
  );
}
