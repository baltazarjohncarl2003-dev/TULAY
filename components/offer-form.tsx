"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field, NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { makeChatOffer } from "@/lib/actions/chats";
import { centavosToInput, php, toCentavos } from "@/lib/format";
import { bpsToPercentInput, percentLabel } from "@/lib/offers";
import type { Unit } from "@/lib/types";
import { chatOfferSchema, unitSchema } from "@/lib/validation/forms";

type Errors = Record<string, string[] | undefined>;

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

export type OfferInitial = {
  productName: string;
  productType: string;
  specs: string;
  unit: Unit;
  quantity: number;
  unitPriceCentavos: number | null;
  shippingFeeCentavos: number | null;
  leadDays: number | null;
  downpaymentBps: number | null;
  paymentTerms: string;
  conditions: string;
};

type Props = {
  conversationId: string;
  relatedOfferId: string | null; // the offer being countered, or null for a new offer
  heading: string; // "Set an offer" or "Counter offer"; the parent decides
  initial: OfferInitial;
  minDownpaymentTotalCentavos: number; // admin setting: totals at or above this need a downpayment above 0%
  onSent: () => void;
  onCancel: () => void;
};

/** Peso or percent text -> integer centavos or basis points; null when blank or invalid. */
function readAmount(text: string): number | null {
  try {
    return toCentavos(text);
  } catch {
    return null;
  }
}

/** Text -> a whole number of at least 1, or null. */
function readQuantity(text: string): number | null {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : null;
}

const shown = (centavos: number | null) => (centavos === null ? "—" : php(centavos));

/** Offer or counteroffer in a chat. Validated here for feedback; the server action validates again and saves. */
export function OfferForm({
  conversationId,
  relatedOfferId,
  heading,
  initial,
  minDownpaymentTotalCentavos,
  onSent,
  onCancel,
}: Props) {
  const [errors, setErrors] = useState<Errors>({});
  const [unitPrice, setUnitPrice] = useState(centavosToInput(initial.unitPriceCentavos));
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [shippingFee, setShippingFee] = useState(centavosToInput(initial.shippingFeeCentavos));
  const [downpaymentPercent, setDownpaymentPercent] = useState(
    initial.downpaymentBps === null ? "" : bpsToPercentInput(initial.downpaymentBps),
  );
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // Reused on retry so the server does not create the offer twice; cleared only after a successful send.
  const key = useRef<string | null>(null);

  // Preview only: the server computes and stores the same amounts.
  const price = readAmount(unitPrice);
  const qty = readQuantity(quantity);
  const shipping = shippingFee.trim() === "" ? 0 : readAmount(shippingFee);
  const subtotal = price !== null && qty !== null ? price * qty : null;
  const total = subtotal !== null && shipping !== null ? subtotal + shipping : null;
  const bps = readAmount(downpaymentPercent);
  const validBps = bps !== null && bps <= 10000 ? bps : null;
  const downpayment = total !== null && validBps !== null ? Math.floor((total * validBps + 5000) / 10000) : null;
  const balance = total !== null && downpayment !== null ? total - downpayment : null;
  const downpaymentLabel = validBps === null ? "Downpayment" : `Downpayment (${percentLabel(validBps)})`;
  const noDownpayment = downpaymentPercent.trim() === "" || bps === 0;
  const needsDownpayment = total !== null && total >= minDownpaymentTotalCentavos && noDownpayment;
  const summary: [string, number | null][] = [
    ["Subtotal", subtotal],
    ["Shipping", shipping],
    ["Total", total],
    [downpaymentLabel, downpayment],
    ["Balance", balance],
  ];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = chatOfferSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(z.flattenError(parsed.error).fieldErrors as Errors);
      toast.error(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    busy.current = true;
    setSending(true);
    let res: Awaited<ReturnType<typeof makeChatOffer>> | undefined;
    try {
      res = await makeChatOffer(
        { conversationId, relatedOfferId },
        values,
        (key.current ??= crypto.randomUUID()),
      );
    } catch {
      toast.error(NETWORK_ERROR);
    }
    if (res?.ok) {
      key.current = null;
      toast.success("Offer sent");
      onSent();
    } else if (res) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
    }
    busy.current = false;
    setSending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{heading}</h3>

      <Field label="Product" name="productName" errors={errors}>
        <Input id="productName" name="productName" required maxLength={160} defaultValue={initial.productName} />
      </Field>

      <Field label="Product type or variant" name="productType" errors={errors}>
        <Input id="productType" name="productType" maxLength={80} defaultValue={initial.productType} />
      </Field>

      <Field label="Price per unit (₱)" name="unitPrice" errors={errors}>
        <Input
          id="unitPrice"
          name="unitPrice"
          inputMode="decimal"
          required
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity" name="quantity" errors={errors}>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Unit" name="unit" errors={errors}>
          <NativeSelect id="unit" name="unit" defaultValue={initial.unit}>
            {unitSchema.options.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Shipping / delivery fee (₱)" name="shippingFee" errors={errors}>
        <Input
          id="shippingFee"
          name="shippingFee"
          inputMode="decimal"
          placeholder="0.00"
          value={shippingFee}
          onChange={(e) => setShippingFee(e.target.value)}
        />
      </Field>

      <Field label="Lead time (days)" name="leadDays" errors={errors}>
        <Input
          id="leadDays"
          name="leadDays"
          type="number"
          min={1}
          max={365}
          required
          defaultValue={initial.leadDays ?? ""}
        />
      </Field>

      <Field label="Downpayment (%)" name="downpaymentPercent" errors={errors}>
        <Input
          id="downpaymentPercent"
          name="downpaymentPercent"
          inputMode="decimal"
          placeholder="e.g. 50"
          value={downpaymentPercent}
          onChange={(e) => setDownpaymentPercent(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm">
        <p className="text-xs font-medium text-muted-foreground">Summary (the server confirms these amounts)</p>
        {summary.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span>{label}</span>
            <span className="tabular-nums">{shown(value)}</span>
          </div>
        ))}
        {needsDownpayment && (
          <p className="text-xs text-destructive">
            Orders of {php(minDownpaymentTotalCentavos)} or more need a downpayment above 0%.
          </p>
        )}
      </div>

      <Field label="Specifications" name="specs" errors={errors}>
        <Textarea id="specs" name="specs" maxLength={1000} defaultValue={initial.specs} />
      </Field>

      <Field label="Payment terms" name="paymentTerms" errors={errors}>
        <Input
          id="paymentTerms"
          name="paymentTerms"
          maxLength={300}
          placeholder="e.g. 50% down, balance before shipping"
          defaultValue={initial.paymentTerms}
        />
      </Field>

      <Field label="Other conditions" name="conditions" errors={errors}>
        <Textarea id="conditions" name="conditions" maxLength={1000} defaultValue={initial.conditions} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={sending}>
          Send offer
        </Button>
      </div>
    </form>
  );
}
