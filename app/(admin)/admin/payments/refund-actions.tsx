"use client";

import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { reissueRefund, retryRefund } from "@/lib/actions/orders";

/** Finance: re-send a pending refund ("retry") or issue a new one for a failed refund ("again"). */
export function RefundActions({ refundId, mode }: { refundId: string; mode: "retry" | "again" }) {
  const { run, pending } = useServerAction();

  function click() {
    if (mode === "retry") run(() => retryRefund(refundId), "Refund sent again");
    // One key per click: the server treats a reused key as the same refund.
    else run(() => reissueRefund(refundId, crypto.randomUUID()), "Refund sent again");
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={click}>
      {mode === "retry" ? "Retry" : "Send again"}
    </Button>
  );
}
