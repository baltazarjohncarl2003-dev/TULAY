"use client";

import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { confirmDelivery } from "@/lib/actions/delivery";

export function ConfirmDelivery({ orderId }: { orderId: string }) {
  const { run, pending } = useServerAction();
  return (
    <Button disabled={pending} onClick={() => run(() => confirmDelivery(orderId), "Delivery confirmed")}>
      Confirm delivery
    </Button>
  );
}
