"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Notice } from "@/components/common";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setStock, setVariants } from "@/lib/actions/orders";
import type { Product, ProductVariant } from "@/lib/types";
import { MAX_QUANTITY } from "@/lib/validation/forms";

// Client checks mirror the server rules in lib/actions/orders.ts; the server checks again.
const MAX_OPTIONS = 50;

const optionRowsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Every option needs a name").max(80, "Keep option names to 80 characters"),
      priceDelta: z.string().trim().regex(/^-?(\d+(\.\d{1,2})?)?$/, "Price change like 5.00 or -5.00"),
    }),
  )
  .max(MAX_OPTIONS, `At most ${MAX_OPTIONS} options`);

const stockSchema = z
  .string()
  .trim()
  .regex(/^\d*$/, "Stock is a whole number of 0 or more")
  .refine((s) => s === "" || Number(s) <= MAX_QUANTITY, "Stock is too large");

/** Signed centavos to peso text without floats: -500 -> "-5.00", 1250 -> "12.50". */
function pesosText(c: number): string {
  const abs = Math.abs(c);
  const text = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return c < 0 ? `-${text}` : text;
}

export function ProductOptions({
  productId,
  status,
  variants,
  stock,
}: {
  productId: string;
  status: Product["status"];
  variants: ProductVariant[];
  stock: number | null;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <h3 className="font-medium">Options and stock</h3>
      <OptionsEditor productId={productId} status={status} variants={variants} />
      <StockEditor productId={productId} variants={variants} stock={stock} />
    </section>
  );
}

type OptionRow = { key: number; name: string; priceDelta: string };

function OptionsEditor({
  productId,
  status,
  variants,
}: {
  productId: string;
  status: Product["status"];
  variants: ProductVariant[];
}) {
  const [rows, setRows] = useState<OptionRow[]>(() =>
    variants.map((v, i) => ({ key: i, name: v.name, priceDelta: pesosText(v.priceDeltaCentavos) })),
  );
  const [nextKey, setNextKey] = useState(variants.length);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useServerAction();

  function save() {
    const parsed = optionRowsSchema.safeParse(rows);
    const names = rows.map((r) => r.name.trim());
    const message = !parsed.success
      ? parsed.error.issues[0].message
      : new Set(names).size !== names.length
        ? "Option names must be unique"
        : null;
    setError(message);
    if (message) return;
    run(
      () => setVariants(productId, rows.map((r) => ({ name: r.name, priceDelta: r.priceDelta }))),
      "Options saved",
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "approved" && (
        <Notice tone="warn">Changing options sends this listing back to TULAY review.</Notice>
      )}
      <p className="text-xs text-muted-foreground">
        Options such as size or colour. The price change is added to the listing price, e.g. 5.00 or -5.00.
      </p>
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-2">
          <Input
            aria-label={`Option ${i + 1} name`}
            maxLength={80}
            placeholder="Size or colour"
            value={r.name}
            onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
          />
          <Input
            aria-label={`Option ${i + 1} price change (PHP)`}
            inputMode="decimal"
            placeholder="0.00"
            value={r.priceDelta}
            onChange={(e) =>
              setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, priceDelta: e.target.value } : x)))
            }
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Remove option ${i + 1}`}
            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_OPTIONS || pending}
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, name: "", priceDelta: "" }]);
            setNextKey(nextKey + 1);
          }}
        >
          <PlusIcon /> Add option
        </Button>
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          Save options
        </Button>
      </div>
    </div>
  );
}

function StockEditor({
  productId,
  variants,
  stock,
}: {
  productId: string;
  variants: ProductVariant[];
  stock: number | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">Stock</h4>
      <p className="text-xs text-muted-foreground">
        Units on hand. Leave blank for made-to-order items, which are not stock-tracked.
      </p>
      {variants.length ? (
        variants.map((v) => (
          <StockInput
            key={`${v.id}:${v.stock}`}
            productId={productId}
            variantId={v.id}
            label={v.name}
            initial={v.stock}
          />
        ))
      ) : (
        <StockInput key={`listing:${stock}`} productId={productId} variantId={null} label="This listing" initial={stock} />
      )}
    </div>
  );
}

function StockInput({
  productId,
  variantId,
  label,
  initial,
}: {
  productId: string;
  variantId: string | null;
  label: string;
  initial: number | null;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useServerAction();

  function save() {
    const parsed = stockSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    run(() => setStock(productId, variantId, parsed.data), "Stock updated");
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-28 text-sm">{label}</span>
        <Input
          aria-label={`Stock for ${label}`}
          inputMode="numeric"
          placeholder="Not tracked"
          className="max-w-36"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={save}>
          Save stock
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
