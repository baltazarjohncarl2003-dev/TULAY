"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field, NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendDirectRfq } from "@/lib/actions/chats";
import type { RfqProduct } from "@/lib/chats";
import { directRfqSchema, unitSchema } from "@/lib/validation/forms";

type Errors = Record<string, string[] | undefined>;

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

type Props = {
  supplierId: string;
  supplierName: string;
  product: RfqProduct | null;
  defaults: { city: string; province: string };
  onSent: (conversationId: string) => void;
  onCancel: () => void;
};

/** Buyer's RFQ to one supplier. Validated here for feedback; the server action validates again and saves. */
export function RfqMessageForm({ supplierId, supplierName, product, defaults, onSent, onCancel }: Props) {
  const [errors, setErrors] = useState<Errors>({});
  const [quantity, setQuantity] = useState(product ? String(product.moq) : "");
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // Reused on retry so the server does not create the RFQ twice; cleared only after a successful send.
  const key = useRef<string | null>(null);

  // Hint only: the supplier's minimum does not block the send.
  const typed = Number(quantity);
  const minimumHint =
    product && quantity !== "" && Number.isInteger(typed) && typed < product.moq
      ? `The supplier's minimum is ${product.moq} ${product.unit}.`
      : undefined;
  const variants = product?.variants ?? [];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    // A listing supplies its own title; the buyer names the product only when there is no listing.
    if (product) delete values.productName;
    const parsed = directRfqSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(z.flattenError(parsed.error).fieldErrors as Errors);
      toast.error(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    busy.current = true;
    setSending(true);
    let res: Awaited<ReturnType<typeof sendDirectRfq>> | undefined;
    try {
      res = await sendDirectRfq(
        { supplierId, productId: product?.id ?? null },
        values,
        (key.current ??= crypto.randomUUID()),
      );
    } catch {
      toast.error(NETWORK_ERROR);
    }
    if (res?.ok) {
      key.current = null;
      toast.success("RFQ sent");
      onSent(res.conversationId);
    } else if (res) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
    }
    busy.current = false;
    setSending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">Request a quote from {supplierName}</h3>

      {product ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm leading-none font-medium">Product</p>
          <p className="text-sm break-words">{product.title}</p>
        </div>
      ) : (
        <Field label="Product" name="productName" errors={errors}>
          <Input id="productName" name="productName" required maxLength={160} />
        </Field>
      )}

      <Field label="Product type or variant" name="productType" errors={errors}>
        <Input id="productType" name="productType" maxLength={80} list={variants.length ? "rfq-variants" : undefined} />
      </Field>
      {variants.length > 0 && (
        <datalist id="rfq-variants">
          {variants.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}

      <Field label="Quantity" name="quantity" errors={errors} hint={minimumHint}>
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
        <NativeSelect id="unit" name="unit" defaultValue={product?.unit ?? "pcs"}>
          {unitSchema.options.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Target price per unit (₱, optional)" name="targetPrice" errors={errors}>
        <Input id="targetPrice" name="targetPrice" inputMode="decimal" placeholder="e.g. 120.00" />
      </Field>

      <Field label="Specifications" name="specs" errors={errors}>
        <Textarea id="specs" name="specs" maxLength={1000} placeholder="Material, sizes, colours, printing…" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Delivery city" name="city" errors={errors}>
          <Input id="city" name="city" required maxLength={100} defaultValue={defaults.city} />
        </Field>
        <Field label="Delivery province" name="province" errors={errors}>
          <Input id="province" name="province" required maxLength={100} defaultValue={defaults.province} />
        </Field>
      </div>

      <Field label="Needed by (optional)" name="requiredBy" errors={errors}>
        <Input id="requiredBy" name="requiredBy" type="date" />
      </Field>

      <Field label="Additional requirements" name="notes" errors={errors}>
        <Textarea id="notes" name="notes" maxLength={1000} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={sending}>
          Send RFQ
        </Button>
      </div>
    </form>
  );
}
