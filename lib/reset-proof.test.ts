import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signResetProof, verifyResetProof } from "./reset-proof";

const USER = "3f2b1c4d-0000-4000-8000-000000000001";
const OTHER = "3f2b1c4d-0000-4000-8000-000000000002";
const NOW = 1_800_000_000_000;
const FIFTEEN_MIN = 15 * 60 * 1000;

beforeEach(() => vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-of-32-characters-or-more"));
afterEach(() => vi.unstubAllEnvs());

describe("reset proof", () => {
  it("verifies a fresh proof for the same user", () => {
    expect(verifyResetProof(signResetProof(USER, NOW), USER, NOW + 1000)).toBe(true);
  });
  it("fails for a different user id", () => {
    expect(verifyResetProof(signResetProof(USER, NOW), OTHER, NOW)).toBe(false);
  });
  it("fails once expired", () => {
    const proof = signResetProof(USER, NOW);
    expect(verifyResetProof(proof, USER, NOW + FIFTEEN_MIN - 1)).toBe(true);
    expect(verifyResetProof(proof, USER, NOW + FIFTEEN_MIN)).toBe(false);
  });
  it("fails with a tampered signature", () => {
    const [id, exp, sig] = signResetProof(USER, NOW).split(".");
    const bad = `${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;
    expect(verifyResetProof(`${id}.${exp}.${bad}`, USER, NOW)).toBe(false);
    expect(verifyResetProof(`${id}.${exp}.${sig.slice(0, -2)}`, USER, NOW)).toBe(false);
  });
  it("fails with a later expiry and the old signature", () => {
    const [id, exp, sig] = signResetProof(USER, NOW).split(".");
    expect(verifyResetProof(`${id}.${Number(exp) + FIFTEEN_MIN}.${sig}`, USER, NOW)).toBe(false);
  });
  it("fails for the old cookie format (just the user id)", () => {
    expect(verifyResetProof(USER, USER, NOW)).toBe(false);
  });
  it("fails without throwing on undefined, empty and garbage values", () => {
    for (const value of [undefined, "", "garbage", "a.b.c", `${USER}.12x.ab`, `${USER}.${NOW + 1}.`, "...."]) {
      expect(verifyResetProof(value, USER, NOW)).toBe(false);
    }
  });
  it("fails for a proof signed with a different secret", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "another-secret-of-32-characters-or-more");
    const proof = signResetProof(USER, NOW);
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-of-32-characters-or-more");
    expect(verifyResetProof(proof, USER, NOW)).toBe(false);
  });
  it("throws when the secret is missing", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => signResetProof(USER, NOW)).toThrow("SUPABASE_SECRET_KEY is not set");
    expect(() => verifyResetProof("x", USER, NOW)).toThrow("SUPABASE_SECRET_KEY is not set");
  });
});
