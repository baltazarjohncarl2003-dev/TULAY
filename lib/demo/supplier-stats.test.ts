import { describe, expect, it } from "vitest";
import { businessDaysBetween, missingDocuments, profileCompleteness } from "./supplier-stats";

describe("missingDocuments", () => {
  it("lists required kinds not uploaded", () => {
    expect(missingDocuments(["bir", "other"])).toEqual(["dti_sec", "mayors_permit", "valid_id"]);
    expect(missingDocuments(["dti_sec", "bir", "mayors_permit", "valid_id"])).toEqual([]);
  });
});

describe("businessDaysBetween", () => {
  it("skips weekends", () => {
    expect(businessDaysBetween("2026-11-06", "2026-11-09")).toBe(1); // Fri -> Mon
    expect(businessDaysBetween("2026-11-06", "2026-11-11")).toBe(3); // Fri -> Wed
    expect(businessDaysBetween("2026-11-07", "2026-11-08")).toBe(0); // Sat -> Sun
  });
  it("is 0 for same day or reversed", () => {
    expect(businessDaysBetween("2026-11-09", "2026-11-09")).toBe(0);
    expect(businessDaysBetween("2026-11-11", "2026-11-06")).toBe(0);
  });
});

describe("profileCompleteness", () => {
  it("is empty for null", () => {
    const r = profileCompleteness(null);
    expect(r).toMatchObject({ done: 0, total: 4 });
    expect(r.items.every((i) => !i.done)).toBe(true);
  });
  it("is complete for a full app", () => {
    const r = profileCompleteness({
      description: "x".repeat(50),
      city: "Quezon City",
      province: "Metro Manila",
      moq: 10,
      leadDays: 5,
      documents: ["dti_sec", "bir", "mayors_permit", "valid_id"].map((kind) => ({ kind })),
    });
    expect(r).toMatchObject({ done: 4, total: 4 });
  });
  it("flags a short description and missing documents", () => {
    const r = profileCompleteness({
      description: "short",
      city: "Cebu",
      province: "Cebu",
      moq: 1,
      leadDays: 1,
      documents: [{ kind: "bir" }],
    });
    expect(r.done).toBe(2);
  });
});
