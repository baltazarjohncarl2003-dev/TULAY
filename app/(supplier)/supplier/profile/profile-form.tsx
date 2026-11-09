"use client";

import { Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, categoryName } from "@/lib/demo/data";
import type { Category, Supplier } from "@/lib/demo/types";
import { supplierProfileSchema } from "@/lib/validation/forms";

function categoryLabel(c: Category) {
  return c.parentSlug ? `${categoryName(c.parentSlug)} › ${c.name}` : c.name;
}

export function ProfileForm({ supplier }: { supplier: Supplier }) {
  const { errors, onSubmit } = useDemoForm(supplierProfileSchema, "Profile submitted for review");

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-6">
      <Field label="Trading name" name="businessName" errors={errors}>
        <Input id="businessName" name="businessName" maxLength={150} defaultValue={supplier.businessName} />
      </Field>

      <Field label="Legal name" name="legalName" errors={errors}>
        <Input id="legalName" name="legalName" maxLength={150} defaultValue={supplier.legalName} />
      </Field>

      <Field label="Main category" name="categorySlug" errors={errors}>
        <NativeSelect id="categorySlug" name="categorySlug" defaultValue={supplier.categorySlug}>
          <option value="">Choose</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {categoryLabel(c)}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="City" name="city" errors={errors}>
        <Input id="city" name="city" maxLength={100} defaultValue={supplier.city} />
      </Field>

      <Field label="Province" name="province" errors={errors}>
        <Input id="province" name="province" maxLength={100} defaultValue={supplier.province} />
      </Field>

      <Field label="Minimum order quantity" name="moq" errors={errors}>
        <Input id="moq" name="moq" type="number" min={1} defaultValue={supplier.moq} />
      </Field>

      <Field label="Typical production lead days" name="leadDays" errors={errors}>
        <Input id="leadDays" name="leadDays" type="number" min={1} defaultValue={supplier.leadDays} />
      </Field>

      <Field label="Capabilities and product details" name="description" errors={errors} className="sm:col-span-2">
        <Textarea id="description" name="description" maxLength={1600} defaultValue={supplier.description} />
      </Field>

      <div className="flex items-end sm:col-span-2">
        <Button type="submit">Submit for review</Button>
      </div>
    </form>
  );
}
