import "server-only";
import { type ActionResult, dbError } from "@/lib/action-result";
import { getPaymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Server-only (not a Server Action): called after the database has created and authorised a pending refund
// (order cancellation, finance refund, claim settlement). Never import this from a "use server" export.

/**
 * Sends a pending refund to the gateway, then settles it in the database (service role). The refund id always
 * comes from a database function that already authorised it, so it is read with the service role too (the
 * courier webhook has no signed-in user).
 */
export async function settleRefund(refundId: string): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: rf } = await admin
    .from("refunds")
    .select("amount_centavos, reason, status, payments(provider_ref)")
    .eq("id", refundId)
    .maybeSingle();
  if (rf?.status !== "pending") return { ok: true }; // already settled (retry or double click)
  const providerRef = rf.payments?.provider_ref;
  if (!providerRef) return { ok: false, error: "Refund recorded; TULAY finance will complete it." };
  try {
    // shortcut: the fake gateway ignores idempotency; pass the refund's idempotency_key when PayMongo is wired.
    const done = await getPaymentProvider().refund({ providerRef, amountCentavos: rf.amount_centavos, reason: rf.reason });
    const { error } = await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: done.providerRefundRef, p_success: true });
    return error ? dbError(error) : { ok: true };
  } catch {
    await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: null as unknown as string, p_success: false });
    return { ok: false, error: "The gateway refused the refund. TULAY finance can retry it from Payments." };
  }
}

/** Finance: re-sends a refund that is still pending (the server stopped before the gateway answered). */
export async function retryPendingRefund(refundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: finance } = await supabase.rpc("has_admin_role", { roles: ["finance"] });
  if (!finance) return { ok: false, error: "Finance role with MFA required" };
  return settleRefund(refundId);
}
