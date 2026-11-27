import "server-only";
import { randomBytes } from "node:crypto";
import { type NinjaVanConfig, ORDER_PATH, signBody, SIGNATURE_HEADER, TOKEN_PATH } from "./ninjavan-wire";

// In-memory stand-in for Ninja Van (same wire shapes as ninjavan-wire.ts). Used by tests, and locally when
// NINJAVAN_MOCK=1 so bookings work before the permit. Never used in production.

export const MOCK_CONFIG: NinjaVanConfig = {
  apiBase: "https://ninjavan.mock/PH",
  clientId: "mock-client",
  clientSecret: "mock-secret-mock-secret-mock-secret",
};

export type MockCall = { path: string; status: number; body: Record<string, unknown> };

export function createNinjaVanMock(opts: { tokenLifetimeS?: number } = {}) {
  const tokens = new Map<string, number>(); // access token -> expiry ms
  const booked = new Map<string, string>(); // requested tracking number -> tracking number
  const calls: MockCall[] = [];
  const failures: number[] = []; // statuses to answer the next order calls with

  const json = (path: string, status: number, body: Record<string, unknown>, reqBody: Record<string, unknown>) => {
    calls.push({ path, status, body: reqBody });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };

  function issue() {
    const access = `acc_${randomBytes(8).toString("hex")}`;
    const lifetime = opts.tokenLifetimeS ?? 3600;
    const expiresMs = Date.now() + lifetime * 1000;
    tokens.set(access, expiresMs);
    return { access_token: access, expires: Math.floor(expiresMs / 1000), expires_in: lifetime, token_type: "bearer" };
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const path = url.pathname.replace(/^\/PH/, "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (path === TOKEN_PATH) {
      if (body.client_id !== MOCK_CONFIG.clientId || body.client_secret !== MOCK_CONFIG.clientSecret) {
        return json(path, 401, { error: "invalid_client" }, body);
      }
      if (body.grant_type === "client_credentials") return json(path, 200, issue(), body);
      return json(path, 400, { error: "invalid_grant" }, body);
    }

    if (path === ORDER_PATH) {
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      const expiry = tokens.get(auth.replace(/^Bearer /, ""));
      if (!expiry || expiry < Date.now()) return json(path, 401, { error: "unauthorized" }, body);
      const fail = failures.shift();
      if (fail) return json(path, fail, { error: { title: "Mock failure" } }, body);
      const requested = String(body.requested_tracking_number ?? "");
      const to = (body.to ?? {}) as Record<string, unknown>;
      if (!requested || !to.name || !to.phone_number) return json(path, 400, { error: { title: "Missing fields" } }, body);
      if (booked.has(requested)) return json(path, 400, { error: { code: 109201, title: "Duplicate Tracking ID" } }, body);
      const tracking = `NVPHTUL${requested}`;
      booked.set(requested, tracking);
      return json(path, 200, { tracking_number: tracking, requested_tracking_number: requested }, body);
    }
    return json(path, 404, { error: "not found" }, body);
  };

  return {
    fetch: mockFetch,
    calls,
    /** Answer the next order calls with these HTTP statuses (e.g. 503, 400). */
    failNextOrders: (...statuses: number[]) => failures.push(...statuses),
    expireAllTokens: () => tokens.forEach((_, k) => tokens.set(k, 0)),
    trackingFor: (requested: string) => booked.get(requested) ?? null,
    /** A webhook the way Ninja Van would send it, signed with the mock client secret. */
    webhook(payload: Record<string, unknown>) {
      const body = JSON.stringify(payload);
      return { body, headers: new Headers({ "content-type": "application/json", [SIGNATURE_HEADER]: signBody(body, MOCK_CONFIG.clientSecret) }) };
    },
  };
}

export type NinjaVanMock = ReturnType<typeof createNinjaVanMock>;
