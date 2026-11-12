// The one interface every payment gateway sits behind (CLAUDE.md: external services behind adapters).

export type PaymentMethod = "card" | "ewallet" | "online_banking";

/** A verified gateway webhook, reduced to what the database needs. */
export type PaymentEvent = {
  /** Gateway event id; the database stores each one once, so duplicates change nothing. */
  id: string;
  type: "payment.paid" | "payment.failed";
  providerRef: string;
  amountCentavos: number;
  /** null = let the database compute it from the admin fee settings. */
  feeCentavos: number | null;
};

export interface PaymentProvider {
  readonly name: "fake" | "paymongo";
  /** Creates a hosted payment session; the buyer is sent to redirectUrl. */
  createSession(input: {
    checkoutId: string;
    amountCentavos: number;
    method: PaymentMethod;
    description: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  /** Where to send a buyer back to an unfinished session. */
  resumeUrl(providerRef: string): string;
  /** Checks the signature on a raw webhook body; null when it is not authentic. */
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;
  /** Asks the gateway to refund part of a payment. Throws when the gateway refuses. */
  refund(input: { providerRef: string; amountCentavos: number; reason: string }): Promise<{ providerRefundRef: string }>;
}
