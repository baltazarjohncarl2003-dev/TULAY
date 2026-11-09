import { describe, expect, it } from "vitest";
import { commissionScheduleSchema, supplierDocumentSchema } from "./forms";

const base = { startsOn: "2027-04-01", categorySlug: "", note: "" };
const bps = (ratePercent: string) => commissionScheduleSchema.safeParse({ ...base, ratePercent });

describe("commission percent -> basis points", () => {
  it("converts without floats", () => {
    expect(bps("0").data?.ratePercent).toBe(0);
    expect(bps("1.5").data?.ratePercent).toBe(150);
    expect(bps("2.05").data?.ratePercent).toBe(205);
    expect(bps("100").data?.ratePercent).toBe(10_000);
  });
  it("rejects bad input", () => {
    for (const v of ["", "-1", "1.234", "abc", "100.01", "1e2"]) expect(bps(v).success).toBe(false);
  });
});

describe("supplier document path", () => {
  const id = "0b3c5d7e-1111-4222-8333-444455556666";
  const ok = (storagePath: string) => supplierDocumentSchema.safeParse({ kind: "bir", storagePath, fileName: "x.pdf" }).success;
  it("accepts <supplierId>/<file>", () => expect(ok(`${id}/abc.pdf`)).toBe(true));
  it("rejects traversal and nesting", () => {
    expect(ok(`${id}/../x.pdf`)).toBe(false);
    expect(ok(`${id}/a/b.pdf`)).toBe(false);
    expect(ok(`abc.pdf`)).toBe(false);
  });
});
