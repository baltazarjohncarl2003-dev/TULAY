"use client";

import { useState } from "react";
import { EmptyState, Notice, StatusPill } from "@/components/common";
import { Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, categoryName } from "@/lib/demo/data";
import type { Category, Product } from "@/lib/demo/types";
import { php, qty } from "@/lib/format";
import { productSchema } from "@/lib/validation/forms";

const UNITS = ["pcs", "boxes", "packs", "sets", "kg"] as const;
const RETURN_CLASSES = [
  { value: "standard", label: "Standard (returnable)" },
  { value: "custom", label: "Custom / made to order" },
  { value: "final_sale", label: "Final sale" },
] as const;

function categoryLabel(c: Category) {
  return c.parentSlug ? `${categoryName(c.parentSlug)} › ${c.name}` : c.name;
}

export function ProductForm({ approved, products }: { approved: boolean; products: Product[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = products.find((p) => p.id === editingId) ?? null;

  return (
    <>
      {approved ? (
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
          <ProductFormBody key={editing?.id ?? "new"} product={editing} />
        </section>
      ) : (
        <div className="mb-10">
          <Notice tone="warn">Your supplier profile must be approved before you can submit public product listings.</Notice>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Your submissions</h2>
      {products.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>MOQ</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>{qty(p.moq)}</TableCell>
                  <TableCell>{p.indicativePriceCentavos === null ? "Quote only" : php(p.indicativePriceCentavos)}</TableCell>
                  <TableCell>
                    <StatusPill status={p.status} />
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" disabled={!approved} onClick={() => {
                        setEditingId(p.id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="No product listings yet." />
      )}
    </>
  );
}

function ProductFormBody({ product }: { product: Product | null }) {
  const { errors, onSubmit } = useDemoForm(productSchema, "Product submitted for review");
  const indicative =
    product?.indicativePriceCentavos == null ? "" : (product.indicativePriceCentavos / 100).toFixed(2);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-6">
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

      <Field
        label="Public product image URL (HTTPS, optional)"
        name="imageUrl"
        errors={errors}
        hint="Image upload arrives with the backend. Use an image URL you own."
        className="sm:col-span-2"
      >
        <Input
          id="imageUrl"
          name="imageUrl"
          type="url"
          maxLength={600}
          placeholder="https://..."
          defaultValue={product?.imageUrl ?? ""}
        />
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

      <div className="flex items-end sm:col-span-2">
        <Button type="submit">Submit for admin review</Button>
      </div>
    </form>
  );
}
