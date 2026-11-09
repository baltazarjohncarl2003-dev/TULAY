"use client";

import { Field, NativeSelect, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitApplication } from "@/lib/actions/supplier";
import { CATEGORIES, categoryName } from "@/lib/demo/data";
import type { Category } from "@/lib/demo/types";
import type { SupplierApplication } from "@/lib/data/supplier";
import { supplierProfileSchema } from "@/lib/validation/forms";

function categoryLabel(c: Category) {
  return c.parentSlug ? `${categoryName(c.parentSlug)} › ${c.name}` : c.name;
}

export function ProfileForm({ initial }: { initial: SupplierApplication | null }) {
  const { errors, onSubmit, pending } = useServerForm(
    supplierProfileSchema,
    submitApplication,
    initial ? "Application updated" : "Application submitted",
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-6">
      <Field label="Trading name" name="businessName" errors={errors}>
        <Input id="businessName" name="businessName" maxLength={150} defaultValue={initial?.businessName ?? ""} />
      </Field>

      <Field label="Legal name" name="legalName" errors={errors}>
        <Input id="legalName" name="legalName" maxLength={150} defaultValue={initial?.legalName ?? ""} />
      </Field>

      <Field label="Main category" name="categorySlug" errors={errors}>
        <NativeSelect id="categorySlug" name="categorySlug" defaultValue={initial?.categorySlug ?? ""}>
          <option value="">Choose</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {categoryLabel(c)}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="City" name="city" errors={errors}>
        <Input id="city" name="city" maxLength={100} defaultValue={initial?.city ?? ""} />
      </Field>

      <Field label="Province" name="province" errors={errors}>
        <Input id="province" name="province" maxLength={100} defaultValue={initial?.province ?? ""} />
      </Field>

      <Field label="Minimum order quantity" name="moq" errors={errors}>
        <Input id="moq" name="moq" type="number" min={1} defaultValue={initial?.moq ?? ""} />
      </Field>

      <Field label="Typical production lead days" name="leadDays" errors={errors}>
        <Input id="leadDays" name="leadDays" type="number" min={1} defaultValue={initial?.leadDays ?? ""} />
      </Field>

      <Field label="Capabilities and product details" name="description" errors={errors} className="sm:col-span-2">
        <Textarea id="description" name="description" maxLength={1600} defaultValue={initial?.description ?? ""} />
      </Field>

      <div className="flex items-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {initial ? "Save and resubmit" : "Submit for review"}
        </Button>
      </div>
    </form>
  );
}
