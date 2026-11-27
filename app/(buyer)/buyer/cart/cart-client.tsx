"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MinusIcon, PlusIcon, ShoppingCartIcon, StoreIcon, Trash2Icon } from "lucide-react";
import { Notice } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CartQuote, cancelCheckout, quoteCartShipping, removeCartItem, startCheckout, updateCartItem } from "@/lib/actions/orders";
import type { OpenCheckout } from "@/lib/data/orders";
import { php, qty } from "@/lib/format";
import type { Address, CartLine, PaymentMethod } from "@/lib/types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "qrph", label: "QR Ph (scan with any bank or e-wallet app)" },
  { value: "card", label: "Card" },
  { value: "ewallet", label: "GCash / Maya (e-wallet)" },
  { value: "online_banking", label: "Online banking" },
];

/** Values from getCheckoutOptions() (admin settings). codMaxOrderCentavos 0 = COD off. */
export type CheckoutOptions = {
  addresses: Address[];
  shippingFeeCentavos: number;
  shippingFees: Record<string, Record<string, number>>;
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

  // Saves a new quantity. Restores the server value when the save is refused.
  function commit(n: number) {
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

  // The input saves on blur or Enter.
  function save() {
    commit(Number(text));
  }

  // The stepper buttons show the new value at once, then save like the input.
  function step(delta: number) {
    const n = line.quantity + delta;
    setText(String(n));
    commit(n);
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
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-accent">
        {line.imageUrl && <Image src={line.imageUrl} alt="" fill unoptimized sizes="5rem" className="object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/products/${line.productId}`} className="line-clamp-2 font-medium hover:underline">
          {line.title}
        </Link>
        {line.variantName && <span className="text-xs text-muted-foreground">Option: {line.variantName}</span>}
        <span className="text-sm">
          {line.unitPriceCentavos === null ? (
            <>
              Price on request — <Link href={`/messages?supplier=${line.supplierId}&product=${line.productId}`} className="underline">send an RFQ</Link>
            </>
          ) : (
            <span className="font-medium text-primary">
              {php(line.unitPriceCentavos)} / {line.unit}
            </span>
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
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {line.unitPriceCentavos !== null && <span className="text-sm font-medium">{php(line.unitPriceCentavos * line.quantity)}</span>}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Decrease quantity for ${line.title}`}
              disabled={pending || line.quantity <= 1}
              onClick={() => step(-1)}
            >
              <MinusIcon />
            </Button>
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
              className="h-8 w-12 text-center"
            />
            <Button variant="outline" size="icon" aria-label={`Increase quantity for ${line.title}`} onClick={() => step(1)} disabled={pending}>
              <PlusIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Remove ${line.title}`} onClick={remove} disabled={pending}>
              <Trash2Icon />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

/** One supplier's delivery line: live price, zone fee with the reason, or an expired price with a refresh button. */
function DeliveryNote({
  quote,
  quoting,
  zoneFee,
  expired,
  timeText,
  onRefresh,
}: {
  quote: CartQuote | undefined;
  quoting: boolean;
  zoneFee: number;
  expired: (q: { expiresAt: string }) => boolean;
  timeText: (iso: string) => string;
  onRefresh: () => void;
}) {
  if (quoting) return <p aria-live="polite">Getting delivery price...</p>;
  if (quote && "quoteId" in quote) {
    return expired(quote) ? (
      <p className="flex flex-wrap items-center gap-2">
        <span>Delivery price expired</span>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh delivery price
        </Button>
      </p>
    ) : (
      <p className="sm:text-right">
        Delivery {php(quote.amountCentavos)}
        <span className="block">Live courier price, held until {timeText(quote.expiresAt)}</span>
      </p>
    );
  }
  return (
    <p className="sm:text-right">
      Delivery {php(zoneFee)}
      {quote && <span className="block">{quote.error}</span>}
    </p>
  );
}

export function CartClient({
  lines,
  idempotencyKey,
  options,
  holdMinutes,
  openCheckout,
}: {
  lines: Line[];
  idempotencyKey: string;
  options: CheckoutOptions;
  /** Admin setting checkout_ttl_minutes. */
  holdMinutes: number;
  /** An unpaid checkout whose payment page is open; it blocks a new checkout. */
  openCheckout: OpenCheckout | null;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>("qrph");
  const [addressId, setAddressId] = useState(options.addresses[0]?.id ?? "");
  const [paymentOption, setPaymentOption] = useState<"online" | "cod">("online");
  const [pending, startTransition] = useTransition();
  // Live delivery prices for the selected address. `key` says which address and refresh round they belong to.
  const [quoted, setQuoted] = useState<{ key: string; quotes: Record<string, CartQuote> }>({ key: "", quotes: {} });
  const [refreshRound, setRefreshRound] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const supplierKey = [...new Set(lines.map((l) => l.supplierId))].sort().join(",");
  const quoteKey = `${addressId}:${refreshRound}:${supplierKey}`;

  useEffect(() => {
    if (!addressId || !supplierKey) return;
    let stale = false;
    quoteCartShipping(addressId)
      .then((res) => {
        if (stale) return;
        if (res.ok) setQuoted({ key: quoteKey, quotes: res.quotes });
        else {
          setQuoted({ key: quoteKey, quotes: {} });
          toast.error(res.error);
        }
      })
      .catch(() => {
        if (!stale) setQuoted({ key: quoteKey, quotes: {} }); // the zone fee applies
      });
    return () => {
      stale = true;
    };
  }, [addressId, supplierKey, quoteKey]);

  // Re-check expiry against the clock so a held price that lapses is noticed without a click.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Back from the payment page can restore this page from the browser cache: reload so the open payment shows.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
        <ShoppingCartIcon className="size-12 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">Your cart is empty.</h2>
        <Link href="/marketplace" className={buttonVariants()}>
          Browse the marketplace
        </Link>
      </div>
    );
  }

  const groups = groupBySupplier(lines);
  const anyUnpriced = lines.some((l) => l.unitPriceCentavos === null);
  const blocked = lines.some((l) => !l.available || l.unitPriceCentavos === null || l.quantity < l.moq);
  // Display only: the database freezes the saved live price (or charges the zone fee) at checkout.
  const quotes = quoted.key === quoteKey ? quoted.quotes : {};
  const quoting = !!addressId && quoted.key !== quoteKey;
  const liveQuote = (supplierId: string) => {
    const q = quotes[supplierId];
    return q && "quoteId" in q ? q : null;
  };
  const expired = (q: { expiresAt: string }) => Date.parse(q.expiresAt) <= now;
  const zoneFee = (supplierId: string) => options.shippingFees[addressId]?.[supplierId] ?? options.shippingFeeCentavos;
  const fee = (supplierId: string) => {
    const q = liveQuote(supplierId);
    return q && !expired(q) ? q.amountCentavos : zoneFee(supplierId);
  };
  const anyExpired = groups.some((g) => {
    const q = liveQuote(g.supplierId);
    return !!q && expired(q);
  });
  const timeText = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", timeStyle: "short" });
  const grandTotal = subtotal(lines) + groups.reduce((sum, g) => sum + fee(g.supplierId), 0);
  const noAddress = options.addresses.length === 0;
  const codOffered = options.codMaxOrderCentavos > 0;
  // Each supplier order (items plus courier fee) must fit under the COD limit.
  const overCodLimit = groups.some((g) => subtotal(g.lines) + fee(g.supplierId) > options.codMaxOrderCentavos);
  const codAllowed = codOffered && !overCodLimit;
  const paymentChoice = codAllowed ? paymentOption : "online";
  // Estimate only: COD custom orders need cod_downpayment_bps of the supplier order online, stock orders nothing.
  const dueNow =
    paymentChoice === "online"
      ? grandTotal
      : groups.reduce((sum, g) => sum + (g.lines.some((l) => l.custom) ? bpsOf(subtotal(g.lines) + fee(g.supplierId), options.codDownpaymentBps) : 0), 0);
  const nothingDueNow = paymentChoice === "cod" && dueNow === 0;
  const blockReasons = [
    lines.some((l) => !l.available) && "remove the unavailable items",
    anyUnpriced && "send an RFQ for items priced on request and remove them from the cart",
    lines.some((l) => l.quantity < l.moq) && "raise items below the minimum order quantity",
  ].filter(Boolean);
  const checkoutLabel = nothingDueNow ? "Place COD order" : "Proceed to payment";
  const checkoutDisabled = pending || blocked || noAddress || !!openCheckout || anyExpired || quoting;

  function cancelOpen(id: string) {
    startTransition(async () => {
      const res = await cancelCheckout(id);
      if (res.ok) toast.success("Payment cancelled. Edit your cart and check out again.");
      else toast.error(res.error);
      router.refresh();
    });
  }

  function checkout() {
    startTransition(async () => {
      const quoteIds = groups.flatMap((g) => {
        const q = liveQuote(g.supplierId);
        return q && !expired({ expiresAt: q.expiresAt }) ? [q.quoteId] : [];
      });
      const res = await startCheckout({ method, idempotencyKey, addressId, paymentOption: paymentChoice, quoteIds });
      if (!res.ok) {
        toast.error(res.error);
        if (/delivery price expired/i.test(res.error)) setRefreshRound((n) => n + 1);
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
    <div className="grid gap-6 pb-24 lg:grid-cols-[1fr_20rem] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-4">
        {openCheckout && (
          <Notice tone="warn">
            <span className="flex flex-col gap-3">
              <span>
                <strong>You have a payment in progress</strong> for {php(openCheckout.totalCentavos)}. The items are held until{" "}
                {new Date(openCheckout.expiresAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", timeStyle: "short" })}. Continue
                paying, or cancel it to change your cart.
              </span>
              <span className="flex flex-wrap gap-2">
                <Link href={openCheckout.payUrl} className={buttonVariants({ size: "lg" })}>
                  Continue payment
                </Link>
                <Button variant="outline" size="lg" disabled={pending} onClick={() => cancelOpen(openCheckout.id)}>
                  Cancel and edit cart
                </Button>
              </span>
            </span>
          </Notice>
        )}
        <Notice>Each supplier ships and bills separately; you pay once.</Notice>
        {groups.map((g) => {
          const unpriced = g.lines.some((l) => l.unitPriceCentavos === null);
          return (
            <section key={g.supplierId} aria-label={g.supplierName} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                <h2 className="flex min-w-0 items-center gap-2 font-semibold">
                  <StoreIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{g.supplierName}</span>
                </h2>
                <p className="shrink-0 text-sm">
                  Supplier total <span className="font-semibold">{php(subtotal(g.lines) + fee(g.supplierId))}</span>
                </p>
              </div>
              <ul className="divide-y px-4">
                {g.lines.map((line) => (
                  <CartLineRow key={line.id} line={line} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
                <p>
                  Subtotal {php(subtotal(g.lines))}
                  {unpriced && " + items priced on request"}
                </p>
                <DeliveryNote
                  quote={quotes[g.supplierId]}
                  quoting={quoting}
                  zoneFee={zoneFee(g.supplierId)}
                  expired={(q) => expired(q)}
                  timeText={timeText}
                  onRefresh={() => setRefreshRound((n) => n + 1)}
                />
              </div>
            </section>
          );
        })}
      </div>

      <aside className="flex h-fit flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-32">
        {/* Below lg the total and checkout button live in the sticky bottom bar. */}
        <p className="hidden items-baseline justify-between text-sm lg:flex">
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
        <div className="hidden lg:block">
          <Button className="w-full" onClick={checkout} disabled={checkoutDisabled}>
            {checkoutLabel}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {nothingDueNow
            ? "The courier collects payment on delivery."
            : `You will pay on the secure payment page. Stock is held for ${holdMinutes} minutes.`}
        </p>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background px-4 py-3 lg:hidden">
        <div className="min-w-0 flex-1">
          {/* COD: show what is charged online now, not the order total the courier mostly collects. */}
          <p className="text-xs text-muted-foreground">{paymentChoice === "cod" ? "Due now (estimate)" : "Total"}</p>
          <p className="truncate text-lg font-bold tabular-nums">{php(paymentChoice === "cod" ? dueNow : grandTotal)}</p>
          {paymentChoice === "cod" ? (
            <p className="text-xs text-muted-foreground">Order total {php(grandTotal)}</p>
          ) : (
            anyUnpriced && <p className="text-xs text-muted-foreground">+ items priced on request</p>
          )}
        </div>
        <Button className="shrink-0" onClick={checkout} disabled={checkoutDisabled}>
          {checkoutLabel}
        </Button>
      </div>
    </div>
  );
}
