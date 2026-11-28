import { afterEach, describe, expect, it, vi } from "vitest";
import { assertFakesAllowed } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("assertFakesAllowed", () => {
  it("allows development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertFakesAllowed("X")).not.toThrow();
  });

  it("allows tests", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => assertFakesAllowed("X")).not.toThrow();
  });

  it("refuses Vercel production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => assertFakesAllowed("X")).toThrow("X is disabled in production");
  });

  it("refuses a production build outside Vercel", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    expect(() => assertFakesAllowed("X")).toThrow("X is disabled in production");
  });

  it("allows Vercel previews", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => assertFakesAllowed("X")).not.toThrow();
  });
});
