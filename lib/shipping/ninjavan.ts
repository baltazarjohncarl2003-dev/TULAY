import "server-only";
import { assertFakesAllowed } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { type StoredToken, withAccessToken } from "./ninjavan-auth";
import { sendWithRetry } from "./ninjavan-http";
import { createNinjaVanMock, MOCK_CONFIG } from "./ninjavan-mock";
import {
  DUPLICATE_TRACKING_CODE,
  isConfigured,
  type NinjaVanConfig,
  ninjaVanConfig,
  ORDER_PATH,
  orderRequestBody,
  parseOrderResponse,
  parseTokenResponse,
  parseWebhook,
  SIGNATURE_HEADER,
  signatureValid,
  TOKEN_PATH,
  tokenRequestBody,
} from "./ninjavan-wire";
import { CourierError, type CourierProvider } from "./types";

// Every courier parcel is booked on TULAY's own Ninja Van account (owner's decision, 2026-11-27); suppliers
// only keep a pickup address. One access token for the whole platform, cached with its expiry.
// Wire details: ninjavan-wire.ts.

export type TokenVault = { load(): Promise<StoredToken | null>; save(token: StoredToken): Promise<void> };

export type NinjaVanDeps = { config: NinjaVanConfig; fetch: typeof fetch; vault: TokenVault; now?: () => number };

// Credentials or token trouble is TULAY's to fix, not the supplier's.
const UNAVAILABLE = "Ninja Van booking is not available right now. TULAY support has been told; try again later.";

export function createNinjaVanCourier(getDeps: () => NinjaVanDeps) {
  async function requestToken(d: NinjaVanDeps): Promise<StoredToken> {
    const res = await sendWithRetry(
      () =>
        d.fetch(`${d.config.apiBase}${TOKEN_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tokenRequestBody(d.config)),
        }),
      { label: "ninjavan token" },
    );
    const parsed = res.ok ? parseTokenResponse(await res.json().catch(() => null), (d.now ?? Date.now)()) : null;
    if (!parsed) throw new CourierError(UNAVAILABLE);
    return parsed;
  }

  return {
    name: "ninjavan" as const,

    async book(input) {
      const d = getDeps();
      if (!isConfigured(d.config)) throw new CourierError("Ninja Van booking is not available yet.");
      if (!input.pickupFrom) throw new CourierError("Add your pickup address first (Company Profile, Ninja Van).");
      const body = JSON.stringify(orderRequestBody({ ...input, sender: input.pickupFrom, now: (d.now ?? Date.now)() }));
      const res = await withAccessToken({ now: d.now, store: d.vault, fetchToken: () => requestToken(d) }, (token) =>
        sendWithRetry(
          () =>
            d.fetch(`${d.config.apiBase}${ORDER_PATH}`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body,
            }),
          { label: "ninjavan create order" },
        ),
      );
      if (res.status === 400) {
        // The duplicate answer (400, error.code 109201) is confirmed by the docs; reading the existing tracking
        // number back is not documented (TODO(ninjavan): ask Ninja Van), so support links it by hand.
        const err = (await res.clone().json().catch(() => null))?.error;
        if (err?.code === DUPLICATE_TRACKING_CODE) {
          throw new CourierError("Ninja Van already has a booking for this order. Contact TULAY support to link it.");
        }
      }
      if (res.status === 401 || res.status === 403) throw new CourierError(UNAVAILABLE);
      if (res.status >= 400 && res.status < 500) throw new CourierError("Ninja Van rejected the booking. Check the pickup and delivery addresses.");
      const trackingRef = res.ok ? parseOrderResponse(await res.json().catch(() => null)) : null;
      if (!trackingRef) throw new Error(`ninjavan create order: unexpected ${res.status}`);
      return { trackingRef, priceCentavos: null, shareLink: null };
    },

    verifyWebhook(rawBody, headers) {
      const d = getDeps();
      if (!signatureValid(rawBody, headers.get(SIGNATURE_HEADER), d.config.clientSecret)) return null;
      return parseWebhook(rawBody);
    },
  } satisfies CourierProvider;
}

// ------------------------------------------------------------------ production wiring

const vault: TokenVault = {
  async load() {
    const { data, error } = await createAdminClient().rpc("courier_load_platform_token", { p_carrier: "ninjavan" });
    if (error) throw new Error(`courier_load_platform_token: ${error.message}`);
    const row = data?.[0];
    return row ? { accessToken: row.access_token, expiresAt: Date.parse(row.expires_at) } : null;
  },
  async save(t) {
    const { error } = await createAdminClient().rpc("courier_save_platform_token", {
      p_carrier: "ninjavan",
      p_access_token: t.accessToken,
      p_expires_at: new Date(t.expiresAt).toISOString(),
    });
    if (error) throw new Error(`courier_save_platform_token: ${error.message}`);
  },
};

/** NINJAVAN_MOCK=1: local in-memory Ninja Van, so booking works before the permit. */
const mockEnabled = () => process.env.NINJAVAN_MOCK === "1";
let mock: ReturnType<typeof createNinjaVanMock> | null = null;

export const ninjavanCourier = createNinjaVanCourier(() => {
  if (mockEnabled()) {
    assertFakesAllowed("The Ninja Van mock");
    mock ??= createNinjaVanMock();
    return { config: MOCK_CONFIG, fetch: mock.fetch as typeof fetch, vault };
  }
  return { config: ninjaVanConfig(), fetch, vault };
});
