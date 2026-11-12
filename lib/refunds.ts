import "server-only";
import { type ActionResult, dbError } from "@/lib/action-result";
import { getPaymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Server-only (not a Server Action): called after the database has created and authorised a pending refund
// (order cancellation, finance refund, claim settlement). Never import this from a "use server" export.

/** Sends a pending refund to the gateway, then settles it in the database (service role). */
export async function settleRefund(refundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: rf } = await supabase
    .from("refunds")
    .select("amount_centavos, reason, payments(provider_ref)")
    .eq("id", refundId)
    .maybeSingle();
  const providerRef = rf?.payments?.provider_ref;
  if (!rf || !providerRef) return { ok: false, error: "Refund recorded; TULAY finance will complete it." };
  const admin = createAdminClient();
  try {
    const done = await getPaymentProvider().refund({ providerRef, amountCentavos: rf.amount_centavos, reason: rf.reason });
    const { error } = await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: done.providerRefundRef, p_success: true });
    return error ? dbError(error) : { ok: true };
  } catch {
    await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: null as unknown as string, p_success: false });
    return { ok: false, error: "The gateway refused the refund. TULAY finance has been notified." };
  }
}
