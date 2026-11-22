import { describe, expect, it } from "vitest";
import { joinPost, splitPost } from "./rfq-post";

describe("request post text", () => {
  it("uses the first line as the product and keeps the whole post", () => {
    expect(splitPost("  500 shirts\nBlack, DTF print \n")).toEqual({
      product: "500 shirts",
      description: "500 shirts\nBlack, DTF print",
    });
  });

  it("caps the product at 160 characters", () => {
    expect(splitPost("x".repeat(200)).product).toHaveLength(160);
  });

  it("does not repeat the product when rebuilding a post", () => {
    expect(joinPost("500 shirts", "500 shirts\nBlack")).toBe("500 shirts\nBlack");
  });

  it("keeps older requests whose description is separate", () => {
    expect(joinPost("500 shirts", "Black")).toBe("500 shirts\nBlack");
    expect(joinPost("500 shirts", "")).toBe("500 shirts");
  });
});
