"use client";

import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveShippingRates } from "@/lib/actions/supplier";
import type { ShippingZone } from "@/lib/data/supplier";
import { php } from "@/lib/format";
import { shippingRatesSchema } from "@/lib/validation/forms";

/** Centavos to a peso text field value. Blank stays blank, so "not provided" is never shown as 0. */
const pesos = (c: number | undefined) => (c == null ? "" : `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`);

export function ShippingRatesForm({
  rates,
  flatFeeCentavos,
}: {
  rates: Partial<Record<ShippingZone, number>>;
  flatFeeCentavos: number;
}) {
  const { errors, onSubmit, pending } = useServerForm(shippingRatesSchema, saveShippingRates, "Shipping fees saved");

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Courier fee charged to the buyer per order, by delivery province. Leave blank to use the platform fee of{" "}
        {php(flatFeeCentavos)}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Metro Manila" name="metroManila" errors={errors}>
          <Input
            id="metroManila"
            name="metroManila"
            inputMode="decimal"
            placeholder="Platform fee"
            defaultValue={pesos(rates.metro_manila)}
          />
        </Field>

        <Field label="Luzon" name="luzon" errors={errors}>
          <Input id="luzon" name="luzon" inputMode="decimal" placeholder="Platform fee" defaultValue={pesos(rates.luzon)} />
        </Field>

        <Field label="Visayas" name="visayas" errors={errors}>
          <Input
            id="visayas"
            name="visayas"
            inputMode="decimal"
            placeholder="Platform fee"
            defaultValue={pesos(rates.visayas)}
          />
        </Field>

        <Field label="Mindanao" name="mindanao" errors={errors}>
          <Input
            id="mindanao"
            name="mindanao"
            inputMode="decimal"
            placeholder="Platform fee"
            defaultValue={pesos(rates.mindanao)}
          />
        </Field>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          Save Shipping Fees
        </Button>
      </div>
    </form>
  );
}
