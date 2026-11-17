import "server-only";
import type { PaymentProvider } from "./types";

// TODO(paymongo): wire after the business permit and PayMongo Platforms onboarding. Implement each
// method from the official PayMongo docs only (checkout sessions, webhook signature header, refunds,
// split payments to supplier child accounts). Do not guess endpoints or fields.
// QR Ph (the default method): PayMongo's docs conflict on whether QR Ph payments can be refunded by API
// ("Refunding transactions" says no; "QRPH Refunds" says yes, from the merchant wallet). Confirm before
// going live, because claims and returns depend on refunds. Dynamic QR codes expire after 30 minutes.
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
