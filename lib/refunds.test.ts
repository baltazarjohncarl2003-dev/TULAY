import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefundRefusedError } from "@/lib/payments/types";

const refund = vi.fn();
const rpc = vi.fn(async () => ({ error: null }));
const row = { amount_centavos: 5000, reason: "Claim", status: "pending", idempotency_key: "key-1", payments: { provider_ref: "ref-1" } };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => ({ refund }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  }),
}));

const { settleRefund } = await import("./refunds");

describe("settleRefund", () => {
  beforeEach(() => {
    refund.mockReset();
    rpc.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes the refund's idempotency key and records success", async () => {
    refund.mockResolvedValue({ providerRefundRef: "fr-1" });
    expect(await settleRefund("r1")).toEqual({ ok: true });
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-1" }));
    expect(rpc).toHaveBeenCalledWith("complete_refund", { p_refund_id: "r1", p_provider_refund_ref: "fr-1", p_success: true });
  });

  it("marks the refund failed only when the gateway clearly refuses", async () => {
    refund.mockRejectedValue(new RefundRefusedError("declined"));
    expect((await settleRefund("r1")).ok).toBe(false);
    expect(rpc).toHaveBeenCalledWith("complete_refund", { p_refund_id: "r1", p_provider_refund_ref: null, p_success: false });
  });

  it("leaves the refund pending when the outcome is unknown", async () => {
    refund.mockRejectedValue(new Error("timeout"));
    expect((await settleRefund("r1")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
