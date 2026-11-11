"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supplierById } from "@/lib/demo/data";
import type { Category, Product, Rfq } from "@/lib/types";
import { rfqDraftSchema, rfqSchema, unitSchema } from "@/lib/validation/forms";

type Errors = Record<string, string[] | undefined>;

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
  deliveryPreference: string;
  needsBirInvoice: boolean;
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
  deliveryPreference: "any",
  needsBirInvoice: false,
  sharingConsent: false,
};

const STEPS: { title: string; fields: (keyof Values)[] }[] = [
  { title: "What you need", fields: ["product", "categorySlug", "description", "specs"] },
  { title: "Quantity & budget", fields: ["quantity", "unit", "budget"] },
  { title: "Delivery & invoicing", fields: ["city", "province", "requiredBy", "deliveryPreference", "needsBirInvoice"] },
  { title: "Review & submit", fields: ["sharingConsent"] },
];
const LAST = STEPS.length - 1;

const DELIVERY_LABELS: Record<string, string> = {
  any: "No preference",
  supplier_delivery: "Supplier delivers",
  buyer_pickup: "Buyer pickup",
  third_party_freight: "Third-party freight",
};

type Props = { categories: Category[]; products: Product[]; rfqs: Rfq[] };

/** Prefill from ?product= (a catalog product), ?draft= (an existing draft RFQ) or ?need= (TULAY AI text). */
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
      deliveryPreference: draft.deliveryPreference,
      needsBirInvoice: draft.needsBirInvoice,
      sharingConsent: draft.sharingConsent,
    };
  }
  const need = search.get("need")?.trim();
  if (need) {
    return {
      ...BLANK,
      product: need.slice(0, 160),
      description: `Drafted from TULAY AI: ${need}`.slice(0, 2500),
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
  const formRef = useRef<HTMLFormElement>(null);
  const focusTarget = useRef<string | null>(null);
  const [step, setStep] = useState(0);
  // Wizard errors (per-step and submit-time); the demo hooks' own errors are not displayed.
  const [errors, setErrors] = useState<Errors>({});
  const [review, setReview] = useState<Record<string, string>>({});
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  // After a render: focus the step heading, or the first invalid field.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const el =
      target === "heading"
        ? document.getElementById(`rfq-step-${step}`)
        : (formRef.current?.elements.namedItem(target) as HTMLElement | null);
    el?.focus();
  });

  const read = () => Object.fromEntries(new FormData(formRef.current!)) as Record<string, string>;

  function go(n: number, focus = "heading") {
    if (n === LAST) setReview(read());
    focusTarget.current = focus;
    setStep(n);
    setErrors((e) => ({ ...e })); // new object so the focus effect also runs when the step is unchanged
  }

  function next() {
    const fields = STEPS[step].fields;
    const mask = Object.fromEntries(fields.map((f) => [f, true])) as Parameters<typeof rfqSchema.pick>[0];
    const result = rfqSchema.pick(mask).safeParse(read());
    if (result.success) {
      setErrors({});
      go(step + 1);
      return;
    }
    const fe = z.flattenError(result.error).fieldErrors as Errors;
    focusTarget.current = fields.find((f) => fe[f]) ?? null;
    setErrors(fe);
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    // The clicked button decides the action: "Save draft" carries data-intent="draft".
    const isDraft = (e.nativeEvent as SubmitEvent).submitter?.dataset.intent === "draft";
    const result = (isDraft ? rfqDraftSchema : rfqSchema).safeParse(read());
    if (result.success) {
      setErrors({});
    } else {
      const fe = z.flattenError(result.error).fieldErrors as Errors;
      setErrors(fe);
      const at = STEPS.findIndex((s) => s.fields.some((f) => fe[f]));
      if (at >= 0) go(at, STEPS[at].fields.find((f) => fe[f]));
    }
    (isDraft ? draft : submit).onSubmit(e);
  }

  const categoryLabel = (c: Category) => {
    const parent = categories.find((p) => p.slug === c.parentSlug);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };

  const summary: { step: number; rows: [string, string | undefined][] }[] = [
    {
      step: 0,
      rows: [
        ["Product / requirement", review.product],
        ["Category", categories.find((c) => c.slug === review.categorySlug)?.name],
        ["Description", review.description],
        ["Specifications", review.specs],
      ],
    },
    {
      step: 1,
      rows: [
        ["Quantity", review.quantity ? `${review.quantity} ${review.unit}` : ""],
        ["Target budget", review.budget ? `PHP ${review.budget}` : ""],
      ],
    },
    {
      step: 2,
      rows: [
        ["Delivery city", review.city],
        ["Province", review.province],
        ["Target delivery date", review.requiredBy],
        ["Delivery preference", DELIVERY_LABELS[review.deliveryPreference]],
        ["Official BIR invoice", review.needsBirInvoice ? "Yes" : "No"],
      ],
    },
  ];

  const heading = (n: number) => (
    <h2 id={`rfq-step-${n}`} tabIndex={-1} className="text-base font-semibold outline-none">
      Step {n + 1} of {STEPS.length}: {STEPS[n].title}
    </h2>
  );

  return (
    <form
      ref={formRef}
      onSubmit={onFormSubmit}
      onKeyDown={(e) => {
        // Enter in a text input advances the wizard instead of submitting early.
        if (e.key === "Enter" && step < LAST && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
          e.preventDefault();
          next();
        }
      }}
      noValidate
      className="grid gap-5 rounded-xl border bg-card p-4 sm:p-6"
    >
      <ol aria-label="RFQ steps" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {STEPS.map((s, i) => {
          const badge = (
            <span
              className={`grid size-5 place-items-center rounded-full text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {i + 1}
            </span>
          );
          return (
            <li key={s.title} aria-current={i === step ? "step" : undefined}>
              {i < step ? (
                <button type="button" onClick={() => go(i)} className="flex items-center gap-1.5 hover:underline">
                  {badge}
                  {s.title}
                </button>
              ) : (
                <span className={`flex items-center gap-1.5 ${i === step ? "font-semibold" : "text-muted-foreground"}`}>
                  {badge}
                  {s.title}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <section hidden={step !== 0} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{heading(0)}</div>
        <Field label="Product / requirement" name="product" errors={errors} className="sm:col-span-2">
          <Input
            id="product"
            name="product"
            maxLength={160}
            placeholder="5,000 printed coffee pouches"
            defaultValue={values.product}
          />
        </Field>

        <Field label="Category" name="categorySlug" errors={errors}>
          <NativeSelect id="categorySlug" name="categorySlug" defaultValue={values.categorySlug}>
            <option value="">Choose category</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {categoryLabel(c)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Product description" name="description" errors={errors} className="sm:col-span-2">
          <Textarea
            id="description"
            name="description"
            maxLength={2500}
            placeholder="Describe purpose, use, printing, packaging style…"
            defaultValue={values.description}
          />
        </Field>

        <Field label="Specifications" name="specs" errors={errors} className="sm:col-span-2">
          <Textarea
            id="specs"
            name="specs"
            maxLength={1800}
            placeholder="Dimensions, material, thickness, printing, closure, food-grade requirements…"
            defaultValue={values.specs}
          />
        </Field>
      </section>

      <section hidden={step !== 1} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{heading(1)}</div>
        <Field label="Required quantity" name="quantity" errors={errors}>
          <Input id="quantity" name="quantity" type="number" min={1} defaultValue={values.quantity} />
        </Field>

        <Field label="Unit" name="unit" errors={errors}>
          <NativeSelect id="unit" name="unit" defaultValue={values.unit}>
            {unitSchema.options.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Target budget (PHP, optional)" name="budget" errors={errors}>
          <Input id="budget" name="budget" inputMode="decimal" placeholder="0.00" defaultValue={values.budget} />
        </Field>
      </section>

      <section hidden={step !== 2} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{heading(2)}</div>
        <Field label="Delivery city" name="city" errors={errors}>
          <Input id="city" name="city" maxLength={100} defaultValue={values.city} />
        </Field>

        <Field label="Province" name="province" errors={errors}>
          <Input id="province" name="province" maxLength={100} defaultValue={values.province} />
        </Field>

        <Field label="Target delivery date" name="requiredBy" errors={errors}>
          <Input id="requiredBy" name="requiredBy" type="date" min={today} defaultValue={values.requiredBy} />
        </Field>

        <Field label="Delivery preference" name="deliveryPreference" errors={errors}>
          <NativeSelect id="deliveryPreference" name="deliveryPreference" defaultValue={values.deliveryPreference}>
            {Object.entries(DELIVERY_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="needsBirInvoice"
            defaultChecked={values.needsBirInvoice}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>I need an official BIR invoice (VAT or non-VAT)</span>
        </label>
      </section>

      <section hidden={step !== LAST} className="grid gap-4">
        {heading(LAST)}
        {summary.map((g) => (
          <div key={g.step} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{STEPS[g.step].title}</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => go(g.step)}>
                Edit
              </Button>
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              {g.rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{value || "Not provided"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

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
          {errors.sharingConsent?.[0] && (
            <p className="text-xs text-destructive" role="alert">
              {errors.sharingConsent[0]}
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {step > 0 && (
          <Button type="button" variant="outline" onClick={() => go(step - 1)}>
            Back
          </Button>
        )}
        {step < LAST ? (
          <Button type="button" onClick={next}>
            Next
          </Button>
        ) : (
          <Button type="submit" data-intent="submit">
            Submit & find suppliers
          </Button>
        )}
        <Button type="submit" variant="outline" data-intent="draft">
          Save draft
        </Button>
        {step === LAST && (
          <Button
            type="button"
            variant="outline"
            // Opens TULAY AI matches in a new tab so the draft in this form is kept.
            onClick={() => {
              const product = (document.getElementById("product") as HTMLInputElement | null)?.value.trim() ?? "";
              window.open(`/search?q=${encodeURIComponent(product)}`, "_blank", "noopener");
            }}
          >
            Preview matches
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Max 5 RFQs per day. No payment is taken.</p>
    </form>
  );
}
