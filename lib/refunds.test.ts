import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefundRefusedError } from "@/lib/payments/types";

const refund = vi.fn();
const rpc = vi.fn(async () => ({ error: null }));
const row = { amount_centavos: 5000, reason: "Claim", status: "pending", idempotency_key: "key-1", payments: { provider_ref: "ref-1" } };

let groupId: string | null = null;
let pendingIds: { id: string }[] = [];
const orFilter = vi.fn(async () => ({ data: pendingIds }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => ({ refund }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row, id: "r1", group_id: groupId } }), or: orFilter }) }) }),
  }),
}));

const { settleRefund, settleRefundGroup } = await import("./refunds");

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

describe("settleRefundGroup", () => {
  beforeEach(() => {
    refund.mockReset();
    rpc.mockClear();
    orFilter.mockClear();
    groupId = null;
    pendingIds = [{ id: "r1" }, { id: "r2" }];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends every pending row of the group, looked up by the head", async () => {
    groupId = "head-1";
    refund.mockResolvedValue({ providerRefundRef: "fr-1" });
    expect(await settleRefundGroup("r1")).toEqual({ ok: true });
    expect(orFilter).toHaveBeenCalledWith("id.eq.head-1,group_id.eq.head-1");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("complete_refund", expect.objectContaining({ p_refund_id: "r2", p_success: true }));
  });

  it("uses the refund itself as the head when it has no group", async () => {
    refund.mockResolvedValue({ providerRefundRef: "fr-1" });
    await settleRefundGroup("r1");
    expect(orFilter).toHaveBeenCalledWith("id.eq.r1,group_id.eq.r1");
  });

  it("settles the other parts and returns the first error when one part fails", async () => {
    refund.mockRejectedValueOnce(new RefundRefusedError("declined")).mockResolvedValueOnce({ providerRefundRef: "fr-2" });
    const res = await settleRefundGroup("r1");
    expect(res.ok).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("is ok when nothing in the group is pending", async () => {
    pendingIds = [];
    expect(await settleRefundGroup("r1")).toEqual({ ok: true });
    expect(refund).not.toHaveBeenCalled();
  });
});
