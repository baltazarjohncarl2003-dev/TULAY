"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { demoAction, Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supplierById } from "@/lib/demo/data";
import type { Category, Product, Rfq } from "@/lib/demo/types";
import { rfqDraftSchema, rfqSchema, unitSchema } from "@/lib/validation/forms";

type Props = { categories: Category[]; products: Product[]; rfqs: Rfq[] };

type Values = {
  product: string;
  categorySlug: string;
  description: string;
  specs: string;
  quantity: string;
  unit: string;
  city: string;
  province: string;
  requiredBy: string;
  budget: string;
  sharingConsent: boolean;
};

const BLANK: Values = {
  product: "",
  categorySlug: "",
  description: "",
  specs: "",
  quantity: "",
  unit: "pcs",
  city: "",
  province: "",
  requiredBy: "",
  budget: "",
  sharingConsent: false,
};

/** Prefill from ?product= (a catalog product) or ?draft= (an existing draft RFQ). */
function prefill(search: URLSearchParams, products: Product[], rfqs: Rfq[]): Values {
  const product = products.find((p) => p.id === search.get("product"));
  if (product) {
    const supplierName = supplierById(product.supplierId)?.businessName ?? "unknown";
    return {
      ...BLANK,
      product: product.title,
      categorySlug: product.categorySlug,
      description: product.description,
      specs: `Reference supplier: ${supplierName}. Please quote specifications, price tiers, and delivery terms.`,
      quantity: String(product.moq),
      unit: product.unit,
    };
  }
  const draft = rfqs.find((r) => r.id === search.get("draft") && r.status === "draft");
  if (draft) {
    return {
      product: draft.product,
      categorySlug: draft.categorySlug,
      description: draft.description,
      specs: draft.specs,
      quantity: String(draft.quantity),
      unit: draft.unit,
      city: draft.city,
      province: draft.province,
      requiredBy: draft.requiredBy,
      budget: draft.budgetCentavos === null ? "" : (draft.budgetCentavos / 100).toFixed(2),
      sharingConsent: draft.sharingConsent,
    };
  }
  return BLANK;
}

export function RfqForm({ categories, products, rfqs }: Props) {
  const search = useSearchParams();
  // Keyed on the query so navigating between prefills resets the uncontrolled inputs.
  return <RfqFormFields key={search.toString()} values={prefill(search, products, rfqs)} categories={categories} />;
}

function RfqFormFields({ values, categories }: { values: Values; categories: Category[] }) {
  const submit = useDemoForm(rfqSchema, "RFQ submitted for review");
  const draft = useDemoForm(rfqDraftSchema, "Draft saved");
  const [intent, setIntent] = useState<"submit" | "draft">("submit");
  const active = intent === "draft" ? draft : submit;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    // The clicked button decides the action: "Save draft" carries data-intent="draft".
    const isDraft = (e.nativeEvent as SubmitEvent).submitter?.dataset.intent === "draft";
    setIntent(isDraft ? "draft" : "submit");
    (isDraft ? draft : submit).onSubmit(e);
  }

  const categoryLabel = (c: Category) => {
    const parent = categories.find((p) => p.slug === c.parentSlug);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };

  return (
    <form onSubmit={onFormSubmit} noValidate className="grid gap-5 rounded-xl border bg-card p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product / requirement" name="product" errors={active.errors} className="sm:col-span-2">
          <Input
            id="product"
            name="product"
            maxLength={160}
            placeholder="5,000 printed coffee pouches"
            defaultValue={values.product}
          />
        </Field>

        <Field label="Category" name="categorySlug" errors={active.errors}>
          <NativeSelect id="categorySlug" name="categorySlug" defaultValue={values.categorySlug}>
            <option value="">Choose category</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryLabel(c)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Product description" name="description" errors={active.errors} className="sm:col-span-2">
          <Textarea
            id="description"
            name="description"
            maxLength={2500}
            placeholder="Describe purpose, use, printing, packaging style…"
            defaultValue={values.description}
          />
        </Field>

        <Field label="Specifications" name="specs" errors={active.errors} className="sm:col-span-2">
          <Textarea
            id="specs"
            name="specs"
            maxLength={1800}
            placeholder="Dimensions, material, thickness, printing, closure, food-grade requirements…"
            defaultValue={values.specs}
          />
        </Field>

        <Field label="Required quantity" name="quantity" errors={active.errors}>
          <Input id="quantity" name="quantity" type="number" min={1} defaultValue={values.quantity} />
        </Field>

        <Field label="Unit" name="unit" errors={active.errors}>
          <NativeSelect id="unit" name="unit" defaultValue={values.unit}>
            {unitSchema.options.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Delivery city" name="city" errors={active.errors}>
          <Input id="city" name="city" maxLength={100} defaultValue={values.city} />
        </Field>

        <Field label="Province" name="province" errors={active.errors}>
          <Input id="province" name="province" maxLength={100} defaultValue={values.province} />
        </Field>

        <Field label="Target delivery date" name="requiredBy" errors={active.errors}>
          <Input id="requiredBy" name="requiredBy" type="date" min={today} defaultValue={values.requiredBy} />
        </Field>

        <Field label="Target budget (PHP, optional)" name="budget" errors={active.errors}>
          <Input id="budget" name="budget" inputMode="decimal" placeholder="0.00" defaultValue={values.budget} />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="sharingConsent"
            defaultChecked={values.sharingConsent}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>I allow TULAY to automatically invite approved, opted-in suppliers that match my requirements.</span>
        </label>
        {active.errors.sharingConsent?.[0] && (
          <p className="text-xs text-destructive" role="alert">
            {active.errors.sharingConsent[0]}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" data-intent="submit">
          Submit & find suppliers
        </Button>
        <Button type="submit" variant="outline" data-intent="draft">
          Save draft
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => demoAction("Matching preview arrives with the backend")}
        >
          Preview matches
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Max 5 RFQs per day. No payment is taken.</p>
    </form>
  );
}
