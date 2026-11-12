"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { EmptyState, Notice, StatusPill } from "@/components/common";
import { Field, NativeSelect, useServerAction, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, submitProduct, updateProduct } from "@/lib/actions/catalog";
import { CATEGORIES, categoryName } from "@/lib/categories";
import type { Category, Product } from "@/lib/types";
import { php, qty } from "@/lib/format";
import { MAX_PRICE_TIERS, productSchema } from "@/lib/validation/forms";
import { ProductImages } from "./product-images";
import { ProductOptions } from "./product-options";

const UNITS = ["pcs", "boxes", "packs", "sets", "kg"] as const;
const RETURN_CLASSES = [
  { value: "standard", label: "Standard (returnable)" },
  { value: "custom", label: "Custom / made to order" },
  { value: "final_sale", label: "Final sale" },
] as const;

/** Centavos to a peso text field value. Blank stays blank, so "not provided" is never shown as 0. */
const tierPesos = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const pesos = (c: number | null | undefined) => (c == null ? "" : tierPesos(c));

type TierRow = { key: number; minQty: string; unitPrice: string };

function categoryLabel(c: Category) {
  return c.parentSlug ? `${categoryName(c.parentSlug)} › ${c.name}` : c.name;
}

export function ProductForm({
  supplierId,
  canList,
  products,
  newProductKey,
}: {
  supplierId: string | null;
  canList: boolean;
  products: Product[];
  newProductKey: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = products.find((p) => p.id === editingId) ?? null;

  return (
    <>
      {supplierId === null ? (
        <div className="mb-10">
          <Notice>
            Apply as a supplier first.{" "}
            <Link href="/supplier/profile" className="text-primary underline">
              Go to your company profile
            </Link>
          </Notice>
        </div>
      ) : canList ? (
        <section className="mb-10 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{editing ? "Edit product" : "Add a product"}</h2>
            {editing && (
              <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                Add a new product instead
              </Button>
            )}
          </div>
          {/* key resets the uncontrolled inputs and the form state when switching products */}
          <ProductFormBody key={editing?.id ?? newProductKey} product={editing} idempotencyKey={newProductKey} />
        </section>
      ) : (
        <div className="mb-10">
          <Notice tone="warn">Your supplier profile must be approved before you can submit public product listings.</Notice>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Your submissions</h2>
      {supplierId && products.length ? (
        <div className="flex flex-col gap-4">
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              supplierId={supplierId}
              canList={canList}
              onEdit={() => {
                setEditingId(p.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No product listings yet." />
      )}
    </>
  );
}

function ProductRow({
  product: p,
  supplierId,
  canList,
  onEdit,
}: {
  product: Product;
  supplierId: string;
  canList: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{p.title}</h3>
          <p className="text-sm text-muted-foreground">
            MOQ {qty(p.moq)} {p.unit} · {p.indicativePriceCentavos === null ? "Quote only" : php(p.indicativePriceCentavos)}
          </p>
        </div>
        <StatusPill status={p.status} />
      </div>
      {p.status === "rejected" && p.reviewNote && <Notice tone="warn">Reason from TULAY: {p.reviewNote}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!canList} onClick={onEdit}>
          Edit
        </Button>
        {(p.status === "draft" || p.status === "rejected") && <SubmitButton productId={p.id} disabled={!canList} />}
      </div>
      <ProductImages supplierId={supplierId} productId={p.id} status={p.status} imageUrls={p.imageUrls ?? []} />
      <ProductOptions productId={p.id} status={p.status} variants={p.variants ?? []} stock={p.stock ?? null} />
    </div>
  );
}

function SubmitButton({ productId, disabled }: { productId: string; disabled: boolean }) {
  const { run, pending } = useServerAction();
  return (
    <Button
      size="sm"
      disabled={disabled || pending}
      onClick={() => run(() => submitProduct(productId), "Submitted for review")}
    >
      Submit for review
    </Button>
  );
}

function ProductFormBody({ product, idempotencyKey }: { product: Product | null; idempotencyKey: string }) {
  const [tiers, setTiers] = useState<TierRow[]>(() =>
    (product?.priceTiers ?? []).map((t, i) => ({
      key: i,
      minQty: String(t.minQty),
      unitPrice: tierPesos(t.unitPriceCentavos),
    })),
  );
  const [nextKey, setNextKey] = useState(tiers.length);
  const { errors, onSubmit, pending } = useServerForm(
    productSchema,
    product
      ? (raw: Record<string, unknown>) => updateProduct(product.id, raw)
      : createProduct,
    product ? "Listing saved" : "Draft saved. Add images, then submit for review.",
  );
  const indicative = pesos(product?.indicativePriceCentavos);
  const tierErrors = [...(errors.tierMinQty ?? []), ...(errors.tierUnitPrice ?? [])];

  return (
    <>
      {product?.status === "approved" && (
        <Notice tone="warn">
          Saving changes sends this listing back to TULAY review; it is hidden until approved again.
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-6">
        {!product && <input type="hidden" name="idempotencyKey" value={idempotencyKey} readOnly />}

        <Field label="Product title" name="title" errors={errors} className="sm:col-span-2">
          <Input
            id="title"
            name="title"
            maxLength={140}
            placeholder="Custom stand-up zipper pouch"
            defaultValue={product?.title ?? ""}
          />
        </Field>

        <Field label="Category" name="categorySlug" errors={errors}>
          <NativeSelect id="categorySlug" name="categorySlug" defaultValue={product?.categorySlug ?? ""}>
            <option value="">Select category</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryLabel(c)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Listing type" name="listingType" errors={errors}>
          <NativeSelect id="listingType" name="listingType" defaultValue={product?.listingType ?? "product"}>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </NativeSelect>
        </Field>

        <Field label="Description and custom options" name="description" errors={errors} className="sm:col-span-2">
          <Textarea
            id="description"
            name="description"
            maxLength={1500}
            placeholder="Materials, sizes, printing methods, finishes, etc."
            defaultValue={product?.description ?? ""}
          />
        </Field>

        <Field label="Minimum order quantity" name="moq" errors={errors}>
          <Input id="moq" name="moq" type="number" min={1} defaultValue={product?.moq ?? ""} />
        </Field>

        <Field label="Unit" name="unit" errors={errors}>
          <NativeSelect id="unit" name="unit" defaultValue={product?.unit ?? "pcs"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="Indicative price per unit (PHP, optional)"
          name="indicativePrice"
          errors={errors}
          hint="Leave blank for quote-only"
        >
          <Input id="indicativePrice" name="indicativePrice" inputMode="decimal" placeholder="0.00" defaultValue={indicative} />
        </Field>

        <Field label="Typical lead days (optional)" name="leadDays" errors={errors}>
          <Input id="leadDays" name="leadDays" type="number" min={1} defaultValue={product?.leadDays ?? ""} />
        </Field>

        <Field label="Return class" name="returnClass" errors={errors}>
          <NativeSelect id="returnClass" name="returnClass" defaultValue={product?.returnClass ?? "standard"}>
            {RETURN_CLASSES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="text-sm font-medium">Volume price tiers (optional)</legend>
          <p className="text-xs text-muted-foreground">
            Lower unit prices for larger orders. Each row applies from that quantity up, and must be above the minimum order quantity.
          </p>
          {tiers.map((t, i) => (
            <div key={t.key} className="flex items-center gap-2">
              <Input
                name="tierMinQty"
                type="number"
                min={1}
                step={1}
                aria-label={`Tier ${i + 1} minimum quantity`}
                value={t.minQty}
                onChange={(e) => setTiers((rows) => rows.map((r) => (r.key === t.key ? { ...r, minQty: e.target.value } : r)))}
              />
              <Input
                name="tierUnitPrice"
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Tier ${i + 1} unit price (PHP)`}
                value={t.unitPrice}
                onChange={(e) => setTiers((rows) => rows.map((r) => (r.key === t.key ? { ...r, unitPrice: e.target.value } : r)))}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove tier ${i + 1}`}
                onClick={() => setTiers((rows) => rows.filter((r) => r.key !== t.key))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tiers.length >= MAX_PRICE_TIERS}
              onClick={() => {
                setTiers((rows) => [...rows, { key: nextKey, minQty: "", unitPrice: "" }]);
                setNextKey(nextKey + 1);
              }}
            >
              <PlusIcon /> Add tier
            </Button>
          </div>
          {tierErrors.map((m) => (
            <p key={m} className="text-sm text-destructive" role="alert">
              {m}
            </p>
          ))}
        </fieldset>

        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {product ? "Save changes" : "Save draft"}
          </Button>
        </div>
      </form>
    </>
  );
}
