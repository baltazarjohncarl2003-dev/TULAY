import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { type StoredToken, withAccessToken } from "./ninjavan-auth";
import { sendWithRetry } from "./ninjavan-http";
import { createNinjaVanMock, MOCK_CONFIG } from "./ninjavan-mock";
import {
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
  type TokenGrant,
  TOKEN_PATH,
  tokenRequestBody,
} from "./ninjavan-wire";
import { CourierError, type CourierProvider } from "./types";

// Each supplier books on its own Ninja Van account (plugin OAuth), so COD cash goes to the supplier.
// Wire details: ninjavan-wire.ts (TODO(ninjavan): verify against the PH docs before the audit).

type Grant = StoredToken & { refreshToken: string };

export type TokenVault = {
  load(supplierId: string): Promise<Grant | null>;
  save(supplierId: string, grant: Grant, scopes: string | null): Promise<void>;
};

export type NinjaVanDeps = { config: NinjaVanConfig; fetch: typeof fetch; vault: TokenVault; now?: () => number };

const NOT_CONNECTED = "Connect your Ninja Van account first (Company Profile, Ninja Van).";

export function createNinjaVanCourier(getDeps: () => NinjaVanDeps) {
  async function requestToken(d: NinjaVanDeps, grant: { code: string } | { refreshToken: string }): Promise<TokenGrant> {
    const res = await sendWithRetry(
      () =>
        d.fetch(`${d.config.apiBase}${TOKEN_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tokenRequestBody(d.config, grant)),
        }),
      { label: "token" },
    );
    const parsed = res.ok ? parseTokenResponse(await res.json().catch(() => null), (d.now ?? Date.now)()) : null;
    if (!parsed) throw new CourierError("Ninja Van did not accept the connection. Connect your account again.");
    return parsed;
  }

  return {
    name: "ninjavan" as const,

    /** OAuth callback: trade the code for tokens and store them for the supplier. */
    async connect(supplierId: string, code: string): Promise<void> {
      const d = getDeps();
      const g = await requestToken(d, { code });
      await d.vault.save(supplierId, g, g.scopes ?? d.config.scopes);
    },

    async book(input) {
      const d = getDeps();
      if (!isConfigured(d.config)) throw new CourierError("Ninja Van booking is not available yet.");
      if (!input.pickupFrom) throw new CourierError("Add your pickup address first (Company Profile, Ninja Van).");
      const pickupFrom = input.pickupFrom;
      const source = {
        now: d.now,
        store: {
          load: () => d.vault.load(input.supplierId),
          save: (t: Grant) => d.vault.save(input.supplierId, t, null),
        },
        async fetchToken(saved: Grant | null): Promise<Grant> {
          if (!saved?.refreshToken) throw new CourierError(saved ? "Your Ninja Van connection expired. Connect it again." : NOT_CONNECTED);
          return requestToken(d, { refreshToken: saved.refreshToken });
        },
      };
      const body = JSON.stringify(
        orderRequestBody({ ...input, sender: pickupFrom, now: (d.now ?? Date.now)() }),
      );
      const res = await withAccessToken(source, (token) =>
        sendWithRetry(
          () =>
            d.fetch(`${d.config.apiBase}${ORDER_PATH}`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body,
            }),
          { label: "create order" },
        ),
      );
      if (res.status === 409) {
        // TODO(ninjavan): confirm how a duplicate requested_tracking_number is answered and whether the
        // existing tracking number can be read back; until then support links it by hand.
        throw new CourierError("Ninja Van already has a booking for this order. Contact TULAY support to link it.");
      }
      if (res.status === 401) throw new CourierError("Your Ninja Van connection expired. Connect it again.");
      if (res.status >= 400 && res.status < 500) throw new CourierError("Ninja Van rejected the booking. Check the pickup and delivery addresses.");
      const trackingRef = res.ok ? parseOrderResponse(await res.json().catch(() => null)) : null;
      if (!trackingRef) throw new Error(`ninjavan create order: unexpected ${res.status}`);
      return { trackingRef };
    },

    verifyWebhook(rawBody, headers) {
      const d = getDeps();
      if (!signatureValid(rawBody, headers.get(SIGNATURE_HEADER), d.config.clientSecret)) return null;
      return parseWebhook(rawBody);
    },
  } satisfies CourierProvider & { connect(supplierId: string, code: string): Promise<void> };
}

// ------------------------------------------------------------------ production wiring

const vault: TokenVault = {
  async load(supplierId) {
    const { data, error } = await createAdminClient().rpc("courier_load_tokens", { p_supplier_id: supplierId, p_carrier: "ninjavan" });
    if (error) throw new Error(`courier_load_tokens: ${error.message}`);
    const row = data?.[0];
    return row ? { accessToken: row.access_token, refreshToken: row.refresh_token, expiresAt: Date.parse(row.expires_at) } : null;
  },
  async save(supplierId, g, scopes) {
    const { error } = await createAdminClient().rpc("courier_save_tokens", {
      p_supplier_id: supplierId,
      p_carrier: "ninjavan",
      p_access_token: g.accessToken,
      p_refresh_token: g.refreshToken,
      p_expires_at: new Date(g.expiresAt).toISOString(),
      p_scopes: scopes as string, // null keeps the saved scopes (generated types do not mark args nullable)
    });
    if (error) throw new Error(`courier_save_tokens: ${error.message}`);
  },
};

/** NINJAVAN_MOCK=1: local in-memory Ninja Van, so Connect and booking work before the permit. */
export const mockEnabled = () => process.env.NINJAVAN_MOCK === "1";
let mock: ReturnType<typeof createNinjaVanMock> | null = null;

export const ninjavanCourier = createNinjaVanCourier(() => {
  if (mockEnabled()) {
    if (process.env.VERCEL_ENV === "production") throw new Error("The Ninja Van mock is disabled in production");
    mock ??= createNinjaVanMock();
    return { config: { ...MOCK_CONFIG, redirectUri: ninjaVanConfig().redirectUri }, fetch: mock.fetch as typeof fetch, vault };
  }
  return { config: ninjaVanConfig(), fetch, vault };
});
