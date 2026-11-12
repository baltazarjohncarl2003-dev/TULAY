import "server-only";
import type { PaymentProvider } from "./types";

// TODO(paymongo): wire after the business permit and PayMongo Platforms onboarding. Implement each
// method from the official PayMongo docs only (checkout sessions, webhook signature header, refunds,
// split payments to supplier child accounts). Do not guess endpoints or fields.
function notConfigured(): never {
  throw new Error("PayMongo is not configured yet (waiting for the business permit). Use PAYMENT_PROVIDER=fake locally.");
}

export const paymongoProvider: PaymentProvider = {
  name: "paymongo",
  createSession: async () => notConfigured(),
  resumeUrl: () => notConfigured(),
  verifyWebhook: () => notConfigured(),
  refund: async () => notConfigured(),
};
