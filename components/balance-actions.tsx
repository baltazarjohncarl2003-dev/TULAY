"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { payShippingDifference, requestBalance, startBalanceCheckout } from "@/lib/actions/orders";
import type { ActionResult } from "@/lib/action-result";
import { php } from "@/lib/format";

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

const METHODS = [
  { value: "qrph", label: "QR Ph (scan with any bank or e-wallet app)" },
  { value: "card", label: "Card" },
  { value: "ewallet", label: "GCash / Maya (e-wallet)" },
  { value: "online_banking", label: "Online banking" },
] as const;
type Method = (typeof METHODS)[number]["value"];

/** Buyer: pays the balance of a split order, or (kind "shipping") the delivery top-up. The server validates the method and creates the checkout. */
export function PayBalanceButton({
  orderId,
  balanceCentavos,
  kind = "balance",
}: {
  orderId: string;
  balanceCentavos: number;
  kind?: "balance" | "shipping";
}) {
  const [method, setMethod] = useState<Method>("qrph");
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // Reused on retry so the server does not create a second checkout; cleared only after a successful start.
  const key = useRef<string | null>(null);

  async function onPay() {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    let res: Awaited<ReturnType<typeof startBalanceCheckout>> | undefined;
    try {
      const start = kind === "shipping" ? payShippingDifference : startBalanceCheckout;
      res = await start(orderId, { method, idempotencyKey: (key.current ??= crypto.randomUUID()) });
    } catch {
      toast.error(NETWORK_ERROR);
    }
    if (res?.ok) {
      key.current = null;
      // Stays busy and disabled while the browser leaves the page.
      window.location.assign(res.redirectUrl);
      return;
    }
    if (res) toast.error(res.error);
    busy.current = false;
    setSending(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <NativeSelect
        aria-label="Payment method"
        value={method}
        disabled={sending}
        onChange={(e) => setMethod(e.target.value as Method)}
      >
        {METHODS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </NativeSelect>
      <Button type="button" onClick={onPay} disabled={sending}>
        {kind === "shipping" ? "Pay delivery difference" : "Pay balance"} {php(balanceCentavos)}
      </Button>
    </div>
  );
}

/** Supplier: asks the server to remind the buyer that the balance of a split order is unpaid. */
export function RequestBalanceButton({ orderId }: { orderId: string }) {
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  async function onRemind() {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    let res: ActionResult | undefined;
    try {
      res = await requestBalance(orderId);
    } catch {
      toast.error(NETWORK_ERROR);
    }
    if (res?.ok) toast.success("Reminder sent");
    else if (res) toast.error(res.error);
    busy.current = false;
    setSending(false);
  }

  return (
    <Button type="button" variant="outline" onClick={onRemind} disabled={sending}>
      Remind buyer to pay the balance
    </Button>
  );
}
