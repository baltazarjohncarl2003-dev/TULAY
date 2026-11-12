import { getCourier } from "@/lib/shipping";
import { createAdminClient } from "@/lib/supabase/admin";

// Courier tracking webhook. Authenticity = signature on the raw body. Idempotency = each event id is
// stored once, so a redelivery returns "duplicate" and changes nothing. A 5xx makes the courier retry.
export async function POST(request: Request) {
  const raw = await request.text();
  const courier = getCourier();
  const event = courier.verifyWebhook(raw, request.headers);
  if (!event) return new Response("Invalid signature", { status: 401 });

  const { data, error } = await createAdminClient().rpc("record_tracking_event", {
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
  return Response.json({ result: data });
}
