import "server-only";
import { assertFakesAllowed } from "@/lib/env";
import { fakeProvider } from "./fake";
import { paymongoProvider } from "./paymongo";
import type { PaymentProvider } from "./types";

export type { PaymentEvent, PaymentMethod, PaymentProvider } from "./types";

/** The configured gateway. The fake one runs in development, tests and Vercel previews only. */
export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "fake";
  if (name === "paymongo") return paymongoProvider;
  if (name === "fake") {
    assertFakesAllowed("The fake payment provider");
    return fakeProvider;
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
}
