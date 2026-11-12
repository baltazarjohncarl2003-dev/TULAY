import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentEvent, PaymentProvider } from "./types";

// Local stand-in for the gateway until the business permit allows PayMongo (owner's decision, 2026-11-09).
// The in-app page /pay/fake/<ref> plays the hosted checkout and posts a signed webhook to our own route,
// so the real webhook path (signature check, idempotency, ledger) is what gets exercised.

const SIGNATURE_HEADER = "x-fake-signature";

const eventSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["payment.paid", "payment.failed"]),
  providerRef: z.string().regex(/^fake_[0-9a-f-]{36}$/),
  amountCentavos: z.number().int().positive(),
  feeCentavos: z.number().int().nonnegative().nullable().default(null),
});

function secret(): string {
  const s = process.env.FAKE_PAYMENT_WEBHOOK_SECRET ?? "";
  if (s.length < 32) throw new Error("FAKE_PAYMENT_WEBHOOK_SECRET must be set (32+ characters) to use the fake payment provider");
  return s;
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("hex");

/** Signs an event the way the fake gateway would (used by the fake pay page and tests). */
export function signFakeEvent(event: PaymentEvent): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  return { body, headers: { "content-type": "application/json", [SIGNATURE_HEADER]: sign(body) } };
}

export const fakeProvider: PaymentProvider = {
  name: "fake",
  async createSession() {
    const providerRef = `fake_${randomUUID()}`;
    return { providerRef, redirectUrl: `/pay/fake/${providerRef}` };
  },
  resumeUrl(providerRef) {
    return `/pay/fake/${providerRef}`;
  },
  verifyWebhook(rawBody, headers) {
    const given = Buffer.from(headers.get(SIGNATURE_HEADER) ?? "", "hex");
    const expected = Buffer.from(sign(rawBody), "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const parsed = eventSchema.safeParse(JSON.parse(rawBody));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  async refund() {
    return { providerRefundRef: `fakerefund_${randomUUID()}` };
  },
};
