"use client";

import { CheckCircle2Icon, CircleIcon, ClipboardCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  type Agreement,
  type DealOrder,
  bothConfirmed,
  isComplete,
  RETURN_CLASS_LABEL,
} from "@/lib/agreements";
import { php, sentence } from "@/lib/format";
import type { ChatOffer } from "@/lib/offers";
import { percentLabel } from "@/lib/offers";
import type { PaymentMethod } from "@/lib/payments/types";
import type { Address, ReturnClass, ShipTo } from "@/lib/types";
import { cn } from "@/lib/utils";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  qrph: "QR Ph (scan with any bank or e-wallet app)",
  card: "Card",
  ewallet: "GCash / Maya (e-wallet)",
  online_banking: "Online banking",
};
const methodSchema = z.custom<PaymentMethod>(
  (v) => typeof v === "string" && v in METHOD_LABEL,
);
const returnClassSchema = z.custom<ReturnClass>(
  (v) => typeof v === "string" && v in RETURN_CLASS_LABEL,
);

function Row({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", className)}>{children}</dd>
    </div>
  );
}

function sameAddress(a: Address, s: ShipTo) {
  return (
    a.recipient === s.recipient &&
    a.phone === s.phone &&
    a.line1 === s.line1 &&
    a.line2 === s.line2 &&
    a.barangay === s.barangay &&
    a.city === s.city &&
    a.province === s.province &&
    a.postalCode === s.postalCode
  );
}

/** The order details under an accepted offer: agreed terms, address, return class, confirmations, then payment. */
export function AgreementCard({
  accept,
  agreement,
  order,
  viewerId,
  viewerSide,
  addresses,
  busy,
  onSetAddress,
  onSetReturnClass,
  onConfirm,
  onPay,
  onPayBalance,
  onRequestBalance,
}: {
  accept: ChatOffer;
  agreement: Agreement | null;
  order: DealOrder | null;
  viewerId: string;
  viewerSide: "buyer" | "supplier";
  addresses: Address[];
  busy: boolean;
  onSetAddress: (addressId: string) => void;
  onSetReturnClass: (cls: ReturnClass) => void;
  onConfirm: (agreementId: string) => void;
  onPay: (agreementId: string, method: PaymentMethod) => void;
  onPayBalance: (orderId: string, method: PaymentMethod) => void;
  onRequestBalance: (orderId: string) => void;
}) {
  const buyer = viewerSide === "buyer";
  const shipTo = agreement?.shipTo ?? null;
  const returnClass = agreement?.returnClass ?? null;
  const [addressId, setAddressId] = useState(
    () =>
      addresses.find((a) => shipTo && sameAddress(a, shipTo))?.id ??
      addresses[0]?.id ??
      "",
  );
  const [cls, setCls] = useState<ReturnClass>(returnClass ?? "custom");
  const [method, setMethod] = useState<PaymentMethod>("qrph");

  const mine = !!agreement && agreement.confirmedBy.includes(viewerId);
  const theirs =
    !!agreement && agreement.confirmedBy.some((id) => id !== viewerId);
  const otherName = buyer ? "Supplier" : "Buyer";
  const complete = isComplete(agreement);

  const balanceDue =
    !!order &&
    order.paymentOption === "split" &&
    order.paidOnlineCentavos < order.totalCentavos &&
    order.status !== "pending_payment" &&
    order.status !== "cancelled";
  const fullyPaid =
    !!order &&
    order.paymentOption === "split" &&
    order.paidOnlineCentavos >= order.totalCentavos;

  const payLabel =
    accept.downpaymentCentavos > 0 &&
    accept.downpaymentCentavos < accept.totalCentavos
      ? `Pay downpayment ${php(accept.downpaymentCentavos)}`
      : `Pay ${php(accept.totalCentavos)}`;

  const methodSelect = (
    <NativeSelect
      aria-label="Payment method"
      value={method}
      disabled={busy}
      onChange={(e) => {
        const m = methodSchema.safeParse(e.target.value);
        if (m.success) setMethod(m.data);
      }}
    >
      {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
        <option key={m} value={m}>
          {METHOD_LABEL[m]}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <article
      aria-label="Order details"
      className="w-full max-w-sm rounded-xl border bg-card p-4 text-sm shadow-sm"
    >
      <header className="flex items-center gap-2">
        <ClipboardCheckIcon
          aria-hidden
          className="size-4 shrink-0 text-primary"
        />
        <h4 className="font-semibold">Order details</h4>
        {agreement && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            Version {agreement.version}
          </span>
        )}
      </header>

      <dl className="mt-3 grid gap-2">
        <Row label="Product">
          {accept.productType
            ? `${accept.productName} · ${accept.productType}`
            : accept.productName}
        </Row>
        <Row label="Quantity × price">{`${accept.quantity} ${accept.unit} × ${php(accept.unitPriceCentavos)}`}</Row>
        <Row label="Shipping">{php(accept.shippingFeeCentavos)}</Row>
        <Row label="Total" className="text-base font-bold">
          {php(accept.totalCentavos)}
        </Row>
        <Row label="Downpayment">{`${percentLabel(accept.downpaymentBps)} · ${php(accept.downpaymentCentavos)}`}</Row>
        <Row label="Balance">
          {php(accept.totalCentavos - accept.downpaymentCentavos)}
        </Row>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Price and quantity are locked. To change them, send a new offer.
      </p>

      <hr className="my-3 border-border" />

      <section className="grid gap-2">
        <h5 className="font-medium">Delivery address</h5>
        {shipTo && (
          <div className="break-words">
            <p>{`${shipTo.recipient} · ${shipTo.phone}`}</p>
            <p>{`${shipTo.line1}${shipTo.line2 ? `, ${shipTo.line2}` : ""}, ${shipTo.barangay ? `${shipTo.barangay}, ` : ""}${shipTo.city}, ${shipTo.province} ${shipTo.postalCode}`}</p>
          </div>
        )}
        {buyer &&
          !order &&
          (addresses.length > 0 ? (
            <div className="grid gap-2">
              <NativeSelect
                aria-label="Delivery address"
                value={addressId}
                disabled={busy}
                onChange={(e) => {
                  const picked = addresses.find((a) => a.id === e.target.value);
                  if (picked) setAddressId(picked.id);
                }}
              >
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.label || a.recipient} — ${a.line1}, ${a.city}`}
                  </option>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onSetAddress(addressId)}
              >
                Use this address
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Add a delivery address first.{" "}
              <Link
                href="/buyer/addresses"
                className="text-primary underline underline-offset-4"
              >
                Go to addresses
              </Link>
            </p>
          ))}
        {!buyer && !shipTo && (
          <p className="text-muted-foreground">
            Waiting for the buyer to add the delivery address.
          </p>
        )}
      </section>

      <hr className="my-3 border-border" />

      <section className="grid gap-2">
        <h5 className="font-medium">Return class</h5>
        {returnClass && <p>{RETURN_CLASS_LABEL[returnClass]}</p>}
        {!buyer && !order && (
          <div className="grid gap-2">
            <NativeSelect
              aria-label="Return class"
              value={cls}
              disabled={busy}
              onChange={(e) => {
                const parsed = returnClassSchema.safeParse(e.target.value);
                if (parsed.success) setCls(parsed.data);
              }}
            >
              {(Object.keys(RETURN_CLASS_LABEL) as ReturnClass[]).map((c) => (
                <option key={c} value={c}>
                  {RETURN_CLASS_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onSetReturnClass(cls)}
            >
              Save
            </Button>
          </div>
        )}
        {buyer && !returnClass && (
          <p className="text-muted-foreground">
            Waiting for the supplier to set the return class.
          </p>
        )}
      </section>

      {agreement?.termsBody && (
        <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-line rounded-md bg-muted p-3 text-xs">
          {agreement.termsBody}
        </div>
      )}

      {agreement && (
        <section className="mt-3 grid gap-2">
          <p className="flex items-center gap-2">
            {mine ? (
              <CheckCircle2Icon aria-hidden className="size-4 text-green-600" />
            ) : (
              <CircleIcon
                aria-hidden
                className="size-4 text-muted-foreground"
              />
            )}
            {`You: ${mine ? "Confirmed" : "Not yet"}`}
          </p>
          <p className="flex items-center gap-2">
            {theirs ? (
              <CheckCircle2Icon aria-hidden className="size-4 text-green-600" />
            ) : (
              <CircleIcon
                aria-hidden
                className="size-4 text-muted-foreground"
              />
            )}
            {`${otherName}: ${theirs ? "Confirmed" : "Not yet"}`}
          </p>

          {complete && !mine && !order && (
            <>
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => onConfirm(agreement.id)}
              >
                I agree to these terms and confirm
              </Button>
              <p className="text-xs text-muted-foreground">
                Any change makes a new version that both of you confirm again.
              </p>
            </>
          )}
          {!complete && (
            <p className="text-xs text-muted-foreground">
              Both the delivery address and the return class are needed before
              confirming.
            </p>
          )}
        </section>
      )}

      {agreement && bothConfirmed(agreement) && !order && (
        <section className="mt-3 grid gap-2">
          {buyer ? (
            <>
              {methodSelect}
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => onPay(agreement.id, method)}
              >
                {payLabel}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">
              Both confirmed. Waiting for the buyer to pay.
            </p>
          )}
        </section>
      )}

      {order && (
        <section className="mt-3 grid gap-2">
          <div
            className={cn(
              "rounded-lg border p-3",
              order.status === "pending_payment"
                ? "bg-muted text-muted-foreground"
                : "border-green-600 bg-green-50 text-green-800",
            )}
          >
            <p className="font-medium">{`Order ${order.ref} · ${sentence(order.status)}`}</p>
            <Link
              href={
                buyer
                  ? `/buyer/orders/${order.id}`
                  : `/supplier/orders/${order.id}`
              }
              className="mt-1 inline-block text-xs text-primary underline underline-offset-4"
            >
              View order
            </Link>
            {order.status === "pending_payment" && (
              <p className="mt-1 text-xs">
                Payment not finished yet. Finish or restart it from the order
                page.
              </p>
            )}
          </div>

          {balanceDue && (
            <>
              <p>{`Balance due ${php(order.totalCentavos - order.paidOnlineCentavos)}`}</p>
              {buyer ? (
                <>
                  {methodSelect}
                  <Button
                    className="w-full"
                    disabled={busy}
                    onClick={() => onPayBalance(order.id, method)}
                  >
                    Pay balance
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRequestBalance(order.id)}
                >
                  Remind buyer to pay the balance
                </Button>
              )}
            </>
          )}
          {fullyPaid && (
            <p className="font-medium text-green-700">Fully paid</p>
          )}
        </section>
      )}
    </article>
  );
}
