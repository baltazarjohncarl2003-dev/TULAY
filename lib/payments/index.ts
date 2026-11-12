import "server-only";
import { fakeProvider } from "./fake";
import { paymongoProvider } from "./paymongo";
import type { PaymentProvider } from "./types";

export type { PaymentEvent, PaymentMethod, PaymentProvider } from "./types";

/** The configured gateway. The fake one never runs in Vercel production. */
export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "fake";
  if (name === "paymongo") return paymongoProvider;
  if (name === "fake") {
    if (process.env.VERCEL_ENV === "production") throw new Error("The fake payment provider is disabled in production");
    return fakeProvider;
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
}
