import { getPaymentProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

// Gateway webhook. Authenticity = signature on the raw body. Idempotency = the database stores each
// event id once, so a redelivery returns "duplicate" and changes nothing. A 5xx makes the gateway retry.
export async function POST(request: Request) {
  const raw = await request.text();
  const provider = getPaymentProvider();
  const event = provider.verifyWebhook(raw, request.headers);
  if (!event) return new Response("Invalid signature", { status: 401 });

  const db = createAdminClient();
  const payload = JSON.parse(raw);
  const { data, error } =
    event.type === "payment.paid"
      ? await db.rpc("confirm_payment", {
          p_provider: provider.name,
          p_event_id: event.id,
          p_provider_ref: event.providerRef,
          p_amount_centavos: event.amountCentavos,
          p_fee_centavos: event.feeCentavos as number, // null = fee from admin settings
          p_payload: payload,
        })
      : await db.rpc("fail_payment", {
          p_provider: provider.name,
          p_event_id: event.id,
          p_provider_ref: event.providerRef,
          p_payload: payload,
        });
  if (error) {
    console.error("payment webhook", error.message);
    return new Response("Could not record the event", { status: 500 });
  }
  return Response.json({ result: data });
}
