"use client";

import { Notice } from "@/components/common";
import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDiscovery } from "@/lib/actions/deals";
import { discoverySchema } from "@/lib/validation/forms";

export function DiscoveryForm({
  approved,
  autoInvites,
  deliveryAreas,
  keywords,
  maxQuantity,
}: {
  /** Only approved suppliers may change matching preferences (kept from the demo form). */
  approved: boolean;
  autoInvites: boolean;
  deliveryAreas: string;
  keywords: string;
  maxQuantity: number | null;
}) {
  const { errors, onSubmit, pending } = useServerForm(discoverySchema, saveDiscovery, "Matching preferences saved");

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:p-6">
      {!approved && (
        <Notice tone="warn">Your supplier business profile must be approved first.</Notice>
      )}

      {/* A disabled fieldset disables every control inside it, including the submit button. */}
      <fieldset disabled={!approved} className="flex flex-col gap-5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="autoInvites"
            defaultChecked={autoInvites}
            className="size-4 accent-primary"
          />
          Enable automatic RFQ invitations
        </label>
        <p className="text-sm text-muted-foreground">
          When TULAY approves a request, it automatically invites only suppliers who turned this on and whose category
          matches.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Delivery coverage (comma-separated)"
            name="deliveryAreas"
            errors={errors}
            className="sm:col-span-2"
          >
            <Input
              id="deliveryAreas"
              name="deliveryAreas"
              maxLength={1000}
              placeholder="Metro Manila, Laguna, nationwide"
              defaultValue={deliveryAreas}
            />
          </Field>

          <Field
            label="Products/capabilities (optional search terms)"
            name="keywords"
            errors={errors}
            className="sm:col-span-2"
          >
            <Input
              id="keywords"
              name="keywords"
              maxLength={300}
              placeholder="shirts, dtf, embroidery"
              defaultValue={keywords}
            />
          </Field>

          <Field label="Maximum order quantity (optional)" name="maxQuantity" errors={errors}>
            <Input
              id="maxQuantity"
              name="maxQuantity"
              type="number"
              min={1}
              max={10000000}
              defaultValue={maxQuantity ?? ""}
            />
          </Field>
        </div>

        <p className="text-sm text-muted-foreground">
          We only invite your business for approved product listings in matching categories, appropriate MOQs, and
          declared delivery locations. You can decline any RFQ.
        </p>

        <div>
          <Button type="submit" disabled={pending}>
            Save automatic matching preferences
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
