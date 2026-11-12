"use client";

import { useRouter } from "next/navigation";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { simulateFakePayment } from "@/lib/actions/orders";

/** Fake gateway only: the two outcome buttons. Both close the payment, so both go back to the order list. */
export function PayButtons({ providerRef }: { providerRef: string }) {
  const router = useRouter();
  const { run, pending } = useServerAction();
  const toOrders = () => router.push("/buyer/orders");
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button className="flex-1" disabled={pending} onClick={() => run(() => simulateFakePayment(providerRef, "paid"), "Payment recorded", toOrders)}>
        Pay now (simulate success)
      </Button>
      <Button variant="outline" className="flex-1" disabled={pending} onClick={() => run(() => simulateFakePayment(providerRef, "failed"), "Failed payment recorded", toOrders)}>
        Simulate a failed payment
      </Button>
    </div>
  );
}
