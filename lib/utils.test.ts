import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps type-scale sizes next to text colors", () => {
    expect(cn("text-title text-primary")).toBe("text-title text-primary");
    expect(cn("text-sm", "text-card-title")).toBe("text-card-title");
  });
});
