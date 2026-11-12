"use client";

import { useState } from "react";
import { EmptyState, StatusPill } from "@/components/common";
import { demoAction, Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES } from "@/lib/categories";
import type { Promotion, PromotionTheme } from "@/lib/types";
import { promotionSchema } from "@/lib/validation/forms";
import { cn } from "@/lib/utils";

type Draft = {
  eyebrow: string;
  ctaLabel: string;
  headline: string;
  subheading: string;
  categorySlug: string;
  theme: PromotionTheme;
  imageUrl: string;
  sortOrder: string;
  status: "active" | "paused";
};

const NEW_DRAFT: Draft = {
  eyebrow: "Explore on TULAY",
  ctaLabel: "Browse products",
  headline: "",
  subheading: "",
  categorySlug: "",
  theme: "red",
  imageUrl: "",
  sortOrder: "0",
  status: "active",
};

const THEME_CLASSES: Record<PromotionTheme, string> = {
  red: "bg-red-600 text-white",
  rose: "bg-rose-100 text-rose-950",
  amber: "bg-amber-100 text-amber-950",
  slate: "bg-slate-800 text-white",
};

function toDraft(p: Promotion): Draft {
  return {
    eyebrow: p.eyebrow,
    ctaLabel: p.ctaLabel,
    headline: p.headline,
    subheading: p.subheading,
    categorySlug: p.categorySlug ?? "",
    theme: p.theme,
    imageUrl: p.imageUrl ?? "",
    sortOrder: String(p.sortOrder),
    status: p.status,
  };
}

export function PromotionsClient({ banners }: { banners: Promotion[] }) {
  const { errors, onSubmit } = useDemoForm(promotionSchema, "Banner saved");
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Loading a banner replaces every field, so the form and preview reset together.
  function edit(p: Promotion) {
    setEditingId(p.id);
    setDraft(toDraft(p));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit banner" : "Create a homepage banner"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Small eyebrow line" name="eyebrow" errors={errors}>
              <Input
                id="eyebrow"
                name="eyebrow"
                maxLength={65}
                value={draft.eyebrow}
                onChange={(e) => update("eyebrow", e.target.value)}
              />
            </Field>
            <Field label="Button label" name="ctaLabel" errors={errors}>
              <Input
                id="ctaLabel"
                name="ctaLabel"
                maxLength={40}
                value={draft.ctaLabel}
                onChange={(e) => update("ctaLabel", e.target.value)}
              />
            </Field>
            <Field label="Banner headline" name="headline" errors={errors} className="sm:col-span-2">
              <Input
                id="headline"
                name="headline"
                maxLength={100}
                placeholder="Custom packaging for growing brands"
                value={draft.headline}
                onChange={(e) => update("headline", e.target.value)}
              />
            </Field>
            <Field label="Supporting text" name="subheading" errors={errors} className="sm:col-span-2">
              <Textarea
                id="subheading"
                name="subheading"
                maxLength={240}
                placeholder="Discover sourcing options and request wholesale quotations."
                value={draft.subheading}
                onChange={(e) => update("subheading", e.target.value)}
              />
            </Field>
            <Field label="Linked category" name="categorySlug" errors={errors}>
              <NativeSelect
                id="categorySlug"
                name="categorySlug"
                value={draft.categorySlug}
                onChange={(e) => update("categorySlug", e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Theme" name="theme" errors={errors}>
              <NativeSelect
                id="theme"
                name="theme"
                value={draft.theme}
                onChange={(e) => update("theme", e.target.value as PromotionTheme)}
              >
                <option value="red">Red</option>
                <option value="rose">Rose</option>
                <option value="amber">Amber</option>
                <option value="slate">Slate</option>
              </NativeSelect>
            </Field>
            <Field
              label="Image URL (HTTPS, optional)"
              name="imageUrl"
              errors={errors}
              className="sm:col-span-2"
            >
              <Input
                id="imageUrl"
                name="imageUrl"
                type="url"
                maxLength={600}
                placeholder="https://..."
                value={draft.imageUrl}
                onChange={(e) => update("imageUrl", e.target.value)}
              />
            </Field>
            <Field label="Order" name="sortOrder" errors={errors}>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                step={1}
                value={draft.sortOrder}
                onChange={(e) => update("sortOrder", e.target.value)}
              />
            </Field>
            <Field label="Status" name="status" errors={errors}>
              <NativeSelect
                id="status"
                name="status"
                value={draft.status}
                onChange={(e) => update("status", e.target.value as Draft["status"])}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </NativeSelect>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Save banner</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Preview</h2>
        <div className={cn("flex flex-col gap-2 rounded-xl p-6", THEME_CLASSES[draft.theme])}>
          <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
            {draft.eyebrow || "Eyebrow"}
          </span>
          <h3 className="text-xl font-bold">{draft.headline || "Banner headline"}</h3>
          <p className="text-sm opacity-90">{draft.subheading || "Supporting text"}</p>
          <span className="mt-2 w-fit rounded-lg border border-current px-3 py-1.5 text-sm font-medium">
            {draft.ctaLabel || "Button label"}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Saved banners</h2>
        {banners.length === 0 ? (
          <EmptyState title="No custom banners yet.">
            <p>Editorial banners will rotate by default.</p>
          </EmptyState>
        ) : (
          banners.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.headline}</CardTitle>
                <CardDescription>{p.subheading}</CardDescription>
                <CardAction>
                  <StatusPill status={p.status} />
                </CardAction>
              </CardHeader>
              <CardFooter className="flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => edit(p)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => demoAction(p.status === "active" ? "Banner paused" : "Banner activated")}
                >
                  {p.status === "active" ? "Pause" : "Activate"}
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
