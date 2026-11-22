import { describe, expect, it } from "vitest";
import { fallbackTitle } from "./chat-title";

describe("fallbackTitle", () => {
  it("keeps a short message, tidying spaces", () => expect(fallbackTitle("  500   mailer boxes ")).toBe("500 mailer boxes"));
  it("cuts a long message at a word", () => {
    const title = fallbackTitle("Starting a café: disposable cups, coffee beans, POS terminal, budget ₱100,000");
    expect(title).toBe("Starting a café: disposable cups, coffee beans…");
  });
  it("cuts one very long word", () => expect(fallbackTitle("x".repeat(100))).toBe(`${"x".repeat(48)}…`));
});
