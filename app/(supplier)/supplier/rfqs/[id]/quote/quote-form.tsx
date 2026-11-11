"use client";

import { useState } from "react";
import { Notice } from "@/components/common";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Quote, Rfq } from "@/lib/types";
import { MAX_PRICE_TIERS, quoteSchema } from "@/lib/validation/forms";

/** Centavos to a peso text field value. Blank stays blank, so "not provided" is never shown as 0. */
const tierPesos = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const pesos = (c: number | null | undefined) => (c == null ? "" : tierPesos(c));

/** Centavos to a peso string with exactly 2 decimals, integer math only. */

const DELIVERY_LABELS = {
  supplier_delivery: "Supplier delivers",
  buyer_pickup: "Buyer pickup",
  third_party_freight: "Third-party freight",
};

type TierRow = { key: number; minQty: string; unitPrice: string };

/** Local calendar date (YYYY-MM-DD) for the date picker's min. */
function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function QuoteForm({ rfq, latest }: { rfq: Rfq; latest: Quote | undefined }) {
  const { errors, onSubmit } = useDemoForm(quoteSchema, "Quotation submitted (new revision)");
  const [today] = useState(todayIso);
  const [tiers, setTiers] = useState<TierRow[]>(() =>
    (latest?.priceTiers ?? []).map((t, i) => ({ key: i, minQty: String(t.minQty), unitPrice: tierPesos(t.unitPriceCentavos) })),
  );
  const [nextKey, setNextKey] = useState(tiers.length);
  const pref = rfq.deliveryPreference;
  const tierErrors = [...(errors.tierMinQty ?? []), ...(errors.tierUnitPrice ?? [])];

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

        <Field
          label="Delivery terms"
          name="deliveryTerms"
          errors={errors}
          hint={pref === "any" ? "Buyer has no preference" : `Buyer prefers: ${DELIVERY_LABELS[pref]}`}
        >
          <NativeSelect
            id="deliveryTerms"
            name="deliveryTerms"
            defaultValue={latest?.deliveryTerms ?? (pref !== "any" ? pref : "supplier_delivery")}
          >
            {Object.entries(DELIVERY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="BIR invoice"
          name="birInvoice"
          errors={errors}
          hint={rfq.needsBirInvoice ? "Buyer needs an official BIR invoice." : undefined}
        >
          <NativeSelect id="birInvoice" name="birInvoice" defaultValue={latest?.birInvoice ?? "vat"}>
            <option value="vat">VAT invoice</option>
            <option value="non_vat">Non-VAT invoice</option>
            <option value="none">No official invoice</option>
          </NativeSelect>
        </Field>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="text-sm font-medium">Volume price tiers (optional)</legend>
          <p className="text-xs text-muted-foreground">
            Lower unit prices for larger orders. Each row applies from that quantity up.
          </p>
          {tiers.map((t, i) => (
            <div key={t.key} className="flex items-center gap-2">
              <Input
                name="tierMinQty"
                type="number"
                min={1}
                step={1}
                aria-label={`Tier ${i + 1} minimum quantity`}
                value={t.minQty}
                onChange={(e) => setTiers((rows) => rows.map((r) => (r.key === t.key ? { ...r, minQty: e.target.value } : r)))}
              />
              <Input
                name="tierUnitPrice"
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Tier ${i + 1} unit price (PHP)`}
                value={t.unitPrice}
                onChange={(e) => setTiers((rows) => rows.map((r) => (r.key === t.key ? { ...r, unitPrice: e.target.value } : r)))}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove tier ${i + 1}`}
                onClick={() => setTiers((rows) => rows.filter((r) => r.key !== t.key))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tiers.length >= MAX_PRICE_TIERS}
              onClick={() => {
                setTiers((rows) => [...rows, { key: nextKey, minQty: "", unitPrice: "" }]);
                setNextKey(nextKey + 1);
              }}
            >
              <PlusIcon /> Add tier
            </Button>
          </div>
          {tierErrors.map((m) => (
            <p key={m} className="text-sm text-destructive" role="alert">
              {m}
            </p>
          ))}
        </fieldset>

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
