import "server-only";
import { type ActionResult, dbError } from "@/lib/action-result";
import { getPaymentProvider } from "@/lib/payments";
import { RefundRefusedError } from "@/lib/payments/types";
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
    .select("amount_centavos, reason, status, idempotency_key, payments(provider_ref)")
    .eq("id", refundId)
    .maybeSingle();
  if (rf?.status !== "pending") return { ok: true }; // already settled (retry or double click)
  const providerRef = rf.payments?.provider_ref;
  if (!providerRef) return { ok: false, error: "Refund recorded; TULAY finance will complete it." };
  try {
    const done = await getPaymentProvider().refund({
      providerRef,
      amountCentavos: rf.amount_centavos,
      reason: rf.reason,
      idempotencyKey: rf.idempotency_key,
    });
    const { error } = await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: done.providerRefundRef, p_success: true });
    return error ? dbError(error) : { ok: true };
  } catch (e) {
    // A timeout may still have paid the buyer: stay pending so a retry reuses the same key instead of paying again.
    if (!(e instanceof RefundRefusedError)) {
      console.error("refund outcome unknown", refundId, e instanceof Error ? e.message : e);
      return { ok: false, error: "The refund is not confirmed yet. TULAY finance can retry it from Payments." };
    }
    await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: null as unknown as string, p_success: false });
    return { ok: false, error: "The gateway refused the refund. TULAY finance can retry it from Payments." };
  }
}

/**
 * An order refund can be split across the order's payments (one row per payment, grouped by the head row). Sends every
 * pending row of the group that `refundId` (head or part) belongs to. Settles all of them; returns the first error.
 */
export async function settleRefundGroup(refundId: string): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: one } = await admin.from("refunds").select("id, group_id").eq("id", refundId).maybeSingle();
  if (!one) return { ok: true };
  const head = one.group_id ?? one.id;
  const { data: pending } = await admin.from("refunds").select("id").eq("status", "pending").or(`id.eq.${head},group_id.eq.${head}`);
  let first: ActionResult | null = null;
  for (const r of pending ?? []) {
    const done = await settleRefund(r.id);
    if (!done.ok && !first) first = done;
  }
  return first ?? { ok: true };
}

/** Finance: re-sends a refund that is still pending (the server stopped before the gateway answered). */
export async function retryPendingRefund(refundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: finance } = await supabase.rpc("has_admin_role", { roles: ["finance"] });
  if (!finance) return { ok: false, error: "Finance role with MFA required" };
  return settleRefund(refundId);
}
