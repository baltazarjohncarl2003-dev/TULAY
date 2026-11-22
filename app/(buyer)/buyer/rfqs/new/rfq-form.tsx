"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, GlobeIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Notice } from "@/components/common";
import { Field, NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveRfq } from "@/lib/actions/deals";
import { joinPost, splitPost } from "@/lib/rfq-post";
import type { Category, Product, Rfq } from "@/lib/types";
import { rfqDraftSchema, rfqSchema, unitSchema } from "@/lib/validation/forms";

type Errors = Record<string, string[] | undefined>;

type Values = {
  post: string;
  categorySlug: string;
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
  publicBoard: boolean;
};

const BLANK: Values = {
  post: "",
  categorySlug: "",
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
  publicBoard: false,
};

// Top-to-bottom order, so the first invalid field gets focus.
const FIELD_ORDER = ["post", "categorySlug", "quantity", "unit", "city", "province", "requiredBy", "specs", "budget", "deliveryPreference", "sharingConsent"];

const DELIVERY_LABELS: Record<string, string> = {
  any: "No preference",
  supplier_delivery: "Supplier delivers",
  buyer_pickup: "Buyer pickup",
  third_party_freight: "Third-party freight",
};

type Author = { name: string; firstName: string; avatarUrl: string | null; city: string; province: string };

type Props = {
  categories: Category[];
  /** Made per request on the server; a new one resets the form on every navigation. */
  idempotencyKey: string;
  /** The draft or "needs information" request being edited, or null when creating. */
  existing: Rfq | null;
  /** ?product= prefill: a catalog product and its supplier's name. */
  product: { product: Product; supplierName: string } | null;
  /** ?need= prefill: TULAY AI text. */
  need: string | null;
  /** Admin setting rfq_max_per_day, read on the server. */
  maxPerDay: number;
  author: Author;
};

/** Prefill from ?draft= (an existing RFQ), ?product= (a catalog product) or ?need= (TULAY AI text). */
function prefill({ existing, product, need, author }: Pick<Props, "existing" | "product" | "need" | "author">): Values {
  if (existing) {
    const c = existing.budgetCentavos;
    return {
      post: joinPost(existing.product, existing.description),
      categorySlug: existing.categorySlug,
      specs: existing.specs,
      quantity: existing.quantity ? String(existing.quantity) : "",
      unit: existing.unit,
      city: existing.city,
      province: existing.province,
      requiredBy: existing.requiredBy,
      // Centavos to peso text without floats.
      budget: c === null ? "" : `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`,
      deliveryPreference: existing.deliveryPreference,
      needsBirInvoice: existing.needsBirInvoice,
      sharingConsent: existing.sharingConsent,
      publicBoard: existing.publicBoard,
    };
  }
  const base = { ...BLANK, city: author.city, province: author.province };
  if (product) {
    const p = product.product;
    return {
      ...base,
      post: joinPost(p.title, p.description),
      categorySlug: p.categorySlug,
      specs: `Reference supplier: ${product.supplierName}. Please quote specifications, price tiers, and delivery terms.`,
      quantity: String(p.moq),
      unit: p.unit,
    };
  }
  return need ? { ...base, post: need.slice(0, 2500) } : base;
}

export function RfqForm({ categories, idempotencyKey, existing, product, need, maxPerDay, author }: Props) {
  return (
    <RfqFormFields
      key={idempotencyKey}
      values={prefill({ existing, product, need, author })}
      categories={categories}
      idempotencyKey={idempotencyKey}
      existing={existing}
      maxPerDay={maxPerDay}
      author={author}
    />
  );
}

function RfqFormFields({
  values,
  categories,
  idempotencyKey,
  existing,
  maxPerDay,
  author,
}: {
  values: Values;
  categories: Category[];
  idempotencyKey: string;
  existing: Rfq | null;
  maxPerDay: number;
  author: Author;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  function showErrors(fe: Errors) {
    const shown: Errors = { ...fe, post: fe.product ?? fe.description };
    setErrors(shown);
    const first = FIELD_ORDER.find((f) => shown[f]);
    const el = first ? (formRef.current?.elements.namedItem(first) as HTMLElement | null) : null;
    el?.closest("details")?.setAttribute("open", ""); // a closed section cannot take focus
    el?.focus();
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The clicked button decides the action: "Save draft" carries data-intent="draft".
    const isDraft = (e.nativeEvent as SubmitEvent).submitter?.dataset.intent === "draft";
    const { post, ...fields } = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    // Specifications stay optional for the buyer; a submitted request must still have them.
    const specs = fields.specs.trim() || (isDraft ? "" : "As described in the request.");
    const raw = { ...fields, ...splitPost(post), specs };
    const result = (isDraft ? rfqDraftSchema : rfqSchema).safeParse(raw);
    if (!result.success) {
      showErrors(z.flattenError(result.error).fieldErrors as Errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      try {
        // The server validates again and enforces the status rules; this check is only for feedback.
        const res = await saveRfq(existing?.id ?? null, raw, !isDraft);
        if (!res.ok) {
          showErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        toast.success(isDraft ? "Draft saved" : "Request posted for TULAY review");
        router.push(`/buyer/rfqs/${res.id}`);
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  }

  function close() {
    const post = formRef.current?.elements.namedItem("post") as HTMLTextAreaElement | null;
    if (post?.value.trim() && post.value !== values.post && !window.confirm("Discard this post?")) return;
    if (window.history.length > 1) router.back();
    else router.push("/buyer/rfqs");
  }

  const categoryLabel = (c: Category) => {
    const parent = categories.find((p) => p.slug === c.parentSlug);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };

  return (
    <form
      ref={formRef}
      onSubmit={onFormSubmit}
      onKeyDown={(e) => {
        // Enter in a small field must not post the request early.
        if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") e.preventDefault();
      }}
      noValidate
      className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      {!existing && <input type="hidden" name="idempotencyKey" value={idempotencyKey} />}

      <header className="relative border-b px-12 py-3.5 text-center">
        <h1 className="text-lg font-bold">{existing ? "Edit request" : "Create request"}</h1>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-muted hover:bg-muted/70"
        >
          <XIcon className="size-5" />
        </button>
      </header>

      <div className="grid gap-4 p-4">
        {existing?.status === "needs_information" && !!existing.reviewNote && (
          <Notice tone="warn">Note from TULAY: {existing.reviewNote}</Notice>
        )}

        <div className="flex items-center gap-3">
          {author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
          ) : (
            <span aria-hidden className="grid size-10 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
              {author.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{author.name}</p>
            <div className="relative mt-0.5 inline-flex items-center">
              <GlobeIcon aria-hidden className="pointer-events-none absolute left-2 size-3.5" />
              <select
                name="publicBoard"
                aria-label="Who can see this request"
                defaultValue={values.publicBoard ? "on" : ""}
                className="h-7 max-w-full appearance-none rounded-md bg-muted pr-7 pl-7 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Matched suppliers</option>
                <option value="on">Matched suppliers + public board</option>
              </select>
              <ChevronDownIcon aria-hidden className="pointer-events-none absolute right-2 size-3.5" />
            </div>
          </div>
        </div>

        <div>
          <Textarea
            name="post"
            aria-label="What do you need?"
            aria-invalid={errors.post ? true : undefined}
            aria-describedby={errors.post ? "post-error" : undefined}
            maxLength={2500}
            rows={5}
            autoFocus
            placeholder={`What do you need, ${author.firstName}?\nExample: 500 black DTF-printed shirts for our company event`}
            defaultValue={values.post}
            className="min-h-32 resize-none border-0 bg-transparent px-0 text-lg shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
          />
          {errors.post?.[0] && (
            <p id="post-error" className="text-xs text-destructive" role="alert">
              Tell suppliers what you need.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
          <p className="col-span-2 text-sm font-semibold">Add to your request</p>
          <Field label="Category" name="categorySlug" errors={errors} className="col-span-2">
            <NativeSelect id="categorySlug" name="categorySlug" defaultValue={values.categorySlug}>
              <option value="">Choose category</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {categoryLabel(c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Quantity" name="quantity" errors={errors}>
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
          <Field label="Deliver to (city)" name="city" errors={errors}>
            <Input id="city" name="city" maxLength={100} defaultValue={values.city} />
          </Field>
          <Field label="Province" name="province" errors={errors}>
            <Input id="province" name="province" maxLength={100} defaultValue={values.province} />
          </Field>
          <Field label="Needed by" name="requiredBy" errors={errors} className="col-span-2">
            <Input id="requiredBy" name="requiredBy" type="date" min={today} defaultValue={values.requiredBy} />
          </Field>
        </div>

        <details open={!!(values.specs || values.budget) || undefined} className="group rounded-xl border p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
            More details (optional)
            <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Specifications" name="specs" errors={errors} className="col-span-2">
              <Textarea
                id="specs"
                name="specs"
                maxLength={1800}
                placeholder="Size, material, printing, packaging…"
                defaultValue={values.specs}
              />
            </Field>
            <Field label="Target budget (PHP)" name="budget" errors={errors}>
              <Input id="budget" name="budget" inputMode="decimal" placeholder="0.00" defaultValue={values.budget} />
            </Field>
            <Field label="Delivery" name="deliveryPreference" errors={errors}>
              <NativeSelect id="deliveryPreference" name="deliveryPreference" defaultValue={values.deliveryPreference}>
                {Object.entries(DELIVERY_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <label className="col-span-2 flex items-start gap-2 text-sm">
              <input type="checkbox" name="needsBirInvoice" defaultChecked={values.needsBirInvoice} className="mt-0.5 size-4 accent-primary" />
              <span>I need an official BIR invoice (VAT or non-VAT)</span>
            </label>
          </div>
        </details>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="sharingConsent" defaultChecked={values.sharingConsent} className="mt-0.5 size-4 accent-primary" />
            <span>Let TULAY invite approved suppliers that match this request.</span>
          </label>
          {errors.sharingConsent?.[0] && (
            <p className="text-xs text-destructive" role="alert">
              {errors.sharingConsent[0]}
            </p>
          )}
          <p className="pl-6 text-xs text-muted-foreground">
            On the public board, suppliers see your post, quantity, province and date, never your name or budget. Avoid putting private details in your post.
          </p>
        </div>

        <Button type="submit" data-intent="submit" disabled={pending} className="h-10 w-full text-base">
          {pending ? "Posting…" : "Post"}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="submit" variant="outline" size="sm" data-intent="draft" disabled={pending}>
              Save draft
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              // Opens TULAY AI matches in a new tab so this post is kept.
              onClick={() => {
                const post = formRef.current?.elements.namedItem("post") as HTMLTextAreaElement | null;
                window.open(`/search?q=${encodeURIComponent(splitPost(post?.value ?? "").product)}`, "_blank", "noopener");
              }}
            >
              Preview matches
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Max {maxPerDay} a day. No payment taken.</p>
        </div>
      </div>
    </form>
  );
}
