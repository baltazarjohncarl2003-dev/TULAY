"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState, Notice } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeCartItem, startCheckout, updateCartItem } from "@/lib/actions/orders";
import { php, qty } from "@/lib/format";
import type { Address, CartLine, PaymentMethod } from "@/lib/types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "ewallet", label: "GCash / Maya (e-wallet)" },
  { value: "online_banking", label: "Online banking" },
];

/** Values from getCheckoutOptions() (admin settings). codMaxOrderCentavos 0 = COD off. */
export type CheckoutOptions = {
  addresses: Address[];
  shippingFeeCentavos: number;
  codMaxOrderCentavos: number;
  codDownpaymentBps: number;
};

/** Integer centavos. Lines priced on request are left out; callers show that separately. */
function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + (l.unitPriceCentavos ?? 0) * l.quantity, 0);
}

/** Basis points as a percent with integer math only: 5000 -> "50", 1250 -> "12.50". */
function percentText(bps: number): string {
  return `${Math.trunc(bps / 100)}${bps % 100 !== 0 ? `.${String(bps % 100).padStart(2, "0")}` : ""}`;
}

/** Same rounding as the database's private.bps_of; display only, checkout decides the real amount. */
function bpsOf(centavos: number, bps: number): number {
  return Math.floor((centavos * bps + 5000) / 10000);
}

function addressLine(a: Address): string {
  return [a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode].filter(Boolean).join(", ");
}

/** A cart line plus whether it is custom-made (from getCart). */
type Line = CartLine & { custom: boolean };

function groupBySupplier(lines: Line[]) {
  const groups = new Map<string, { supplierId: string; supplierName: string; lines: Line[] }>();
  for (const l of lines) {
    const g = groups.get(l.supplierId) ?? { supplierId: l.supplierId, supplierName: l.supplierName, lines: [] };
    g.lines.push(l);
    groups.set(l.supplierId, g);
  }
  return [...groups.values()];
}

function CartLineRow({ line }: { line: CartLine }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(String(line.quantity));

  // Saves on blur or Enter. Restores the server value when the save is refused.
  function save() {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n === line.quantity) {
      setText(String(line.quantity));
      return;
    }
    startTransition(async () => {
      const res = await updateCartItem(line.id, n);
      if (res.ok) {
        router.refresh();
      } else {
        setText(String(line.quantity));
        toast.error(res.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeCartItem(line.id);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <li className="flex gap-3 py-4">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-accent">
        {line.imageUrl && <Image src={line.imageUrl} alt="" fill unoptimized sizes="4rem" className="object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/products/${line.productId}`} className="font-medium hover:underline">
          {line.title}
        </Link>
        {line.variantName && <span className="text-xs text-muted-foreground">Option: {line.variantName}</span>}
        <span className="text-sm">
          {line.unitPriceCentavos === null ? (
            <>
              Price on request — <Link href={`/buyer/rfqs/new?product=${line.productId}`} className="underline">send an RFQ</Link>
            </>
          ) : (
            <>
              {php(line.unitPriceCentavos)} / {line.unit}
            </>
          )}
        </span>
        {!line.available && <span className="text-sm font-medium text-destructive">Unavailable</span>}
        {line.quantity < line.moq && (
          <span className="text-xs text-amber-700">
            Minimum order is {qty(line.moq)} {line.unit}.
          </span>
        )}
        {line.stock !== null && line.quantity > line.stock && (
          <span className="text-xs text-amber-700">Only {qty(line.stock)} left.</span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={`Quantity for ${line.title}`}
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-8 w-20"
        />
        {line.unitPriceCentavos !== null && <span className="text-sm font-medium">{php(line.unitPriceCentavos * line.quantity)}</span>}
        <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
          Remove
        </Button>
      </div>
    </li>
  );
}

export function CartClient({
  lines,
  idempotencyKey,
  options,
  holdMinutes,
}: {
  lines: Line[];
  idempotencyKey: string;
  options: CheckoutOptions;
  /** Admin setting checkout_ttl_minutes. */
  holdMinutes: number;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [addressId, setAddressId] = useState(options.addresses[0]?.id ?? "");
  const [paymentOption, setPaymentOption] = useState<"online" | "cod">("online");
  const [pending, startTransition] = useTransition();

  if (lines.length === 0) {
    return (
      <EmptyState title="Your cart is empty.">
        <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
          Browse the marketplace
        </Link>
      </EmptyState>
    );
  }

  const groups = groupBySupplier(lines);
  const anyUnpriced = lines.some((l) => l.unitPriceCentavos === null);
  const blocked = lines.some((l) => !l.available || l.unitPriceCentavos === null || l.quantity < l.moq);
  const fee = options.shippingFeeCentavos;
  const grandTotal = subtotal(lines) + fee * groups.length;
  const noAddress = options.addresses.length === 0;
  const codOffered = options.codMaxOrderCentavos > 0;
  // Each supplier order (items plus courier fee) must fit under the COD limit.
  const overCodLimit = groups.some((g) => subtotal(g.lines) + fee > options.codMaxOrderCentavos);
  const codAllowed = codOffered && !overCodLimit;
  const paymentChoice = codAllowed ? paymentOption : "online";
  // Estimate only: COD custom orders need cod_downpayment_bps of the supplier order online, stock orders nothing.
  const dueNow =
    paymentChoice === "online"
      ? grandTotal
      : groups.reduce((sum, g) => sum + (g.lines.some((l) => l.custom) ? bpsOf(subtotal(g.lines) + fee, options.codDownpaymentBps) : 0), 0);
  const nothingDueNow = paymentChoice === "cod" && dueNow === 0;
  const blockReasons = [
    lines.some((l) => !l.available) && "remove the unavailable items",
    anyUnpriced && "send an RFQ for items priced on request and remove them from the cart",
    lines.some((l) => l.quantity < l.moq) && "raise items below the minimum order quantity",
  ].filter(Boolean);

  function checkout() {
    startTransition(async () => {
      const res = await startCheckout({ method, idempotencyKey, addressId, paymentOption: paymentChoice });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (nothingDueNow) {
        toast.success("Order placed. Pay the courier on delivery.");
        router.push(res.redirectUrl);
        return;
      }
      window.location.assign(res.redirectUrl);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Notice>Each supplier ships and bills separately; you pay once.</Notice>
        {groups.map((g) => {
          const unpriced = g.lines.some((l) => l.unitPriceCentavos === null);
          return (
            <section key={g.supplierId} aria-label={g.supplierName} className="rounded-lg border bg-card px-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3">
                <h2 className="font-semibold">{g.supplierName}</h2>
                <div className="flex flex-col items-end gap-0.5 text-sm">
                  <p>
                    Subtotal {php(subtotal(g.lines))}
                    {unpriced && <span className="text-muted-foreground"> + items priced on request</span>}
                  </p>
                  <p>Courier fee: {php(fee)}</p>
                  <p className="font-semibold">Supplier total {php(subtotal(g.lines) + fee)}</p>
                </div>
              </div>
              <ul className="divide-y">
                {g.lines.map((line) => (
                  <CartLineRow key={line.id} line={line} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-lg border bg-card p-4 lg:sticky lg:top-32">
        <p className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">Total</span>
          <span className="text-xl font-bold">
            {php(grandTotal)}
            {anyUnpriced && <span className="block text-xs font-normal text-muted-foreground">+ items priced on request</span>}
          </span>
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Deliver to</legend>
          {noAddress ? (
            <Notice tone="warn">
              Add a delivery address before you pay. <Link href="/buyer/addresses" className="underline">Manage addresses</Link>
            </Notice>
          ) : (
            <>
              {options.addresses.map((a) => (
                <label key={a.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="addressId"
                    value={a.id}
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                    className="mt-1 size-4"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{a.label ? `${a.label}: ${a.recipient}` : a.recipient}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.phone} · {addressLine(a)}
                    </span>
                  </span>
                </label>
              ))}
              <Link href="/buyer/addresses" className="w-fit text-sm underline">
                Manage addresses
              </Link>
            </>
          )}
        </fieldset>
        {!nothingDueNow && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Payment method</legend>
            {METHODS.map((m) => (
              <label key={m.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="size-4"
                />
                {m.label}
              </label>
            ))}
          </fieldset>
        )}
        {codOffered && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">When to pay</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="paymentOption"
                value="online"
                checked={paymentChoice === "online"}
                onChange={() => setPaymentOption("online")}
                className="size-4"
              />
              Pay online
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="paymentOption"
                value="cod"
                checked={paymentChoice === "cod"}
                disabled={!codAllowed}
                onChange={() => setPaymentOption("cod")}
                className="size-4"
              />
              Cash on delivery
            </label>
            {overCodLimit && (
              <p className="text-xs text-muted-foreground">
                Cash on delivery is available up to {php(options.codMaxOrderCentavos)} per supplier order, courier fee included.
              </p>
            )}
            {paymentChoice === "cod" && lines.some((l) => l.custom) && (
              <p className="text-xs text-muted-foreground">
                Custom-made items need an online downpayment of {percentText(options.codDownpaymentBps)}% first; the courier collects the rest.
              </p>
            )}
            {paymentChoice === "cod" && (
              <div className="flex flex-col gap-1 text-sm">
                <p className="flex justify-between gap-2">
                  <span>Due now (estimate)</span>
                  <span className="tabular-nums">{php(dueNow)}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span>On delivery (estimate)</span>
                  <span className="tabular-nums">{php(grandTotal - dueNow)}</span>
                </p>
              </div>
            )}
          </fieldset>
        )}
        {blocked && <Notice tone="warn">Before you can check out, {blockReasons.join("; ")}.</Notice>}
        <Button onClick={checkout} disabled={pending || blocked || noAddress}>
          {nothingDueNow ? "Place COD order" : "Proceed to payment"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {nothingDueNow
            ? "The courier collects payment on delivery."
            : `You will pay on the secure payment page. Stock is held for ${holdMinutes} minutes.`}
        </p>
      </aside>
    </div>
  );
}
