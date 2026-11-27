import { settleRefundGroup } from "@/lib/refunds";
import { getCourier } from "@/lib/shipping";
import { createAdminClient } from "@/lib/supabase/admin";

// Courier tracking webhook. Authenticity = signature on the raw body. Idempotency = each event id is
// stored once, so a redelivery returns "duplicate" and changes nothing. A 5xx makes the courier retry.
export async function POST(request: Request) {
  const raw = await request.text();
  // Lalamove probes the URL with an empty body when it is registered; it must get a 200 or registration fails.
  if (!raw.trim()) return new Response(null, { status: 200 });
  const courier = getCourier();
  const event = courier.verifyWebhook(raw, request.headers);
  if (!event) return new Response("Invalid signature", { status: 401 });
  // Authentic but not a status we track (e.g. pending pickup): acknowledge so the courier stops retrying.
  if (event === "ignored") return Response.json({ result: "ignored" });

  const admin = createAdminClient();
  if ("kind" in event) {
    // Courier-side booking changes (ended, cancelled, replaced), not tracking progress.
    const res =
      event.kind === "void"
        ? await admin.rpc("void_shipment_by_ref", { p_carrier: courier.name, p_tracking_ref: event.trackingRef, p_reason: event.reason })
        : event.kind === "flag"
          ? await admin.rpc("flag_courier_issue", {
              p_carrier: courier.name, p_tracking_ref: event.trackingRef, p_order_id: null as unknown as string, p_note: event.note,
            })
          : await admin.rpc("replace_shipment_ref", { p_carrier: courier.name, p_prev_ref: event.trackingRef, p_new_ref: event.newTrackingRef });
    if (res.error) {
      console.error("shipping webhook", event.kind, res.error.message);
      return new Response("Could not record the event", { status: 500 });
    }
    return Response.json({ result: res.data ?? event.kind });
  }

  const { data, error } = await admin.rpc("record_tracking_event", {
    p_carrier: courier.name,
    p_event_id: event.id,
    p_tracking_ref: event.trackingRef,
    p_status: event.status,
    p_occurred_at: event.occurredAt,
    p_note: event.note,
    p_cod_collected_centavos: event.codCollectedCentavos as number, // null = no COD collected
    p_payload: JSON.parse(raw),
  });
  if (error) {
    console.error("shipping webhook", error.message);
    return new Response("Could not record the event", { status: 500 });
  }
  // A returned parcel created a refund: send it now (finance can retry from Payments if the gateway fails).
  if (data.startsWith("refund:")) await settleRefundGroup(data.slice("refund:".length));
  return Response.json({ result: data });
}
