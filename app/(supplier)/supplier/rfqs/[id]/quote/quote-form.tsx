"use client";

import { useState } from "react";
import { Notice } from "@/components/common";
import { Field, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Quote, Rfq } from "@/lib/demo/types";
import { quoteSchema } from "@/lib/validation/forms";

/** Centavos to a peso text field value. Blank stays blank, so "not provided" is never shown as 0. */
const pesos = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

/** Local calendar date (YYYY-MM-DD) for the date picker's min. */
function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function QuoteForm({ rfq, latest }: { rfq: Rfq; latest: Quote | undefined }) {
  const { errors, onSubmit } = useDemoForm(quoteSchema, "Quotation submitted (new revision)");
  const [today] = useState(todayIso);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quoted quantity" name="quantity" errors={errors}>
          <Input id="quantity" name="quantity" type="number" min={1} defaultValue={latest?.quantity ?? rfq.quantity} />
        </Field>

        <Field label="Unit price (PHP)" name="unitPrice" errors={errors}>
          <Input
            id="unitPrice"
            name="unitPrice"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={pesos(latest?.unitPriceCentavos)}
          />
        </Field>

        <Field label="Setup fee (PHP)" name="setupFee" errors={errors}>
          <Input
            id="setupFee"
            name="setupFee"
            inputMode="decimal"
            placeholder="Leave blank if unknown"
            defaultValue={pesos(latest?.setupFeeCentavos)}
          />
        </Field>

        <Field label="Shipping fee (PHP)" name="shippingFee" errors={errors}>
          <Input
            id="shippingFee"
            name="shippingFee"
            inputMode="decimal"
            placeholder="Leave blank if unknown"
            defaultValue={pesos(latest?.shippingFeeCentavos)}
          />
        </Field>

        <Field label="Applicable tax amount (PHP)" name="tax" errors={errors}>
          <Input
            id="tax"
            name="tax"
            inputMode="decimal"
            placeholder="Leave blank if unknown"
            defaultValue={pesos(latest?.taxCentavos)}
          />
        </Field>

        <Field label="Production lead time (days)" name="leadDays" errors={errors}>
          <Input id="leadDays" name="leadDays" type="number" min={1} defaultValue={latest?.leadDays ?? ""} />
        </Field>

        <Field label="Quote valid until" name="validUntil" errors={errors}>
          <Input id="validUntil" name="validUntil" type="date" min={today} defaultValue={latest?.validUntil ?? ""} />
        </Field>

        <Field label="Payment terms" name="paymentTerms" errors={errors}>
          <Input
            id="paymentTerms"
            name="paymentTerms"
            maxLength={300}
            placeholder="50% downpayment, balance before shipment"
            defaultValue={latest?.paymentTerms ?? ""}
          />
        </Field>

        <Field label="Commercial notes" name="notes" errors={errors} className="sm:col-span-2">
          <Textarea id="notes" name="notes" maxLength={1200} defaultValue={latest?.notes ?? ""} />
        </Field>
      </div>

      <Notice>
        {"Known total = quantity × unit price + the fees you fill in. Blank fees show as 'not provided', not zero."}
      </Notice>

      <div>
        <Button type="submit">Submit quotation version</Button>
      </div>
    </form>
  );
}
