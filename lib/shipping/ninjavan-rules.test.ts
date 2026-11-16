import { describe, expect, it, vi } from "vitest";
import { getAccessToken, REFRESH_MARGIN_MS, type StoredToken, withAccessToken } from "./ninjavan-auth";
import { MAX_ATTEMPTS, sendWithRetry } from "./ninjavan-http";

const NOW = 1_800_000_000_000;

function source(saved: StoredToken | null) {
  let stored = saved;
  let issued = 0;
  const fetchToken = vi.fn(async () => ({ accessToken: `new-${++issued}`, expiresAt: NOW + 3_600_000 }));
  const store = { load: async () => stored, save: vi.fn(async (t: StoredToken) => void (stored = t)) };
  return { store, fetchToken, now: () => NOW };
}

describe("Ninja Van token rules", () => {
  it("reuses a saved token that is not near expiry", async () => {
    const src = source({ accessToken: "saved", expiresAt: NOW + REFRESH_MARGIN_MS + 1000 });
    expect(await getAccessToken(src)).toBe("saved");
    expect(src.fetchToken).not.toHaveBeenCalled();
  });

  it("gets and saves a new token within 5 minutes of expiry", async () => {
    const src = source({ accessToken: "old", expiresAt: NOW + REFRESH_MARGIN_MS - 1000 });
    expect(await getAccessToken(src)).toBe("new-1");
    expect(src.store.save).toHaveBeenCalledOnce();
  });

  it("gets a token when none is saved", async () => {
    expect(await getAccessToken(source(null))).toBe("new-1");
  });

  it("retries once with a new token after a 401, never more", async () => {
    const src = source({ accessToken: "saved", expiresAt: NOW + 3_600_000 });
    const call = vi.fn<(token: string) => Promise<Response>>(async () => new Response("", { status: 401 }));
    const res = await withAccessToken(src, call);
    expect(res.status).toBe(401);
    expect(call.mock.calls.map((c) => c[0])).toEqual(["saved", "new-1"]);
    expect(src.fetchToken).toHaveBeenCalledOnce();
  });
});

describe("Ninja Van retry rules", () => {
  const sleep = async () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});

  it("returns a success without retrying", async () => {
    const send = vi.fn(async () => new Response("{}", { status: 200 }));
    expect((await sendWithRetry(send, { label: "t", sleep })).status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
  });

  it("never retries a 4xx", async () => {
    const send = vi.fn(async () => new Response('{"error":"bad"}', { status: 400 }));
    expect((await sendWithRetry(send, { label: "t", sleep })).status).toBe(400);
    expect(send).toHaveBeenCalledOnce();
  });

  it("retries a 5xx, then succeeds", async () => {
    const send = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect((await sendWithRetry(send, { label: "t", sleep })).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt limit on network failures", async () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(sendWithRetry(send, { label: "t", sleep })).rejects.toThrow("offline");
    expect(send).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});
