"use client";

import { useState } from "react";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { adminRefundUnmatched } from "@/lib/actions/orders";

export function UnmatchedRefund({ paymentId, idempotencyKey }: { paymentId: string; idempotencyKey: string }) {
  const { run, pending } = useServerAction();
  // The payment stays "needs_review" after its refund, so block a second click on this page view.
  const [sent, setSent] = useState(false);

  function refund() {
    run(() => adminRefundUnmatched(paymentId, idempotencyKey), "Refund sent", () => setSent(true));
  }

  return (
    <Button size="sm" variant="outline" disabled={pending || sent} onClick={refund}>
      {sent ? "Refund sent" : "Refund in full"}
    </Button>
  );
}
