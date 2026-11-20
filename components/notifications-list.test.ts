import { describe, expect, it } from "vitest";
import { notificationCategory } from "./notifications-list";

describe("notificationCategory", () => {
  it("groups order and payout links as orders", () => {
    expect(notificationCategory("/buyer/orders/1")).toBe("orders");
    expect(notificationCategory("/supplier/payouts")).toBe("orders");
  });

  it("groups RFQ, quote and invite links as deals", () => {
    expect(notificationCategory("/buyer/rfqs/7")).toBe("deals");
    expect(notificationCategory("/buyer/quotes/4")).toBe("deals");
    expect(notificationCategory("/supplier/invites")).toBe("deals");
    expect(notificationCategory("/buyer/requests")).toBe("deals");
  });

  it("groups claim links as claims", () => {
    expect(notificationCategory("/buyer/claims/3")).toBe("claims");
  });

  it("falls back to system for everything else", () => {
    expect(notificationCategory("/buyer/account")).toBe("system");
    expect(notificationCategory("/")).toBe("system");
    expect(notificationCategory("")).toBe("system");
  });

  it("ignores the query string and hash when matching", () => {
    expect(notificationCategory("/buyer/account?next=/orders")).toBe("system");
    expect(notificationCategory("/buyer/account#/claims")).toBe("system");
    expect(notificationCategory("/buyer/orders?tab=2")).toBe("orders");
  });
});
