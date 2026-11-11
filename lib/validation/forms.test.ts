import { describe, expect, it } from "vitest";
import { commissionScheduleSchema, productSchema, quoteSchema, supplierDocumentSchema } from "./forms";

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

describe("quoteSchema price tiers", () => {
  const base = {
    quantity: "100", unitPrice: "10", setupFee: "", shippingFee: "", tax: "", leadDays: "7",
    validUntil: "2026-12-01", paymentTerms: "50% down", deliveryTerms: "buyer_pickup", birInvoice: "vat",
  };
  it("parses repeated rows into sorted centavo tiers and drops blank rows", () => {
    const r = quoteSchema.parse({ ...base, tierMinQty: ["500", "", "200"], tierUnitPrice: ["8.50", "", "9"] });
    expect(r.priceTiers).toEqual([{ minQty: 200, unitPriceCentavos: 900 }, { minQty: 500, unitPriceCentavos: 850 }]);
    expect(r).not.toHaveProperty("tierMinQty");
  });
  it("accepts a single row and no rows", () => {
    expect(quoteSchema.parse({ ...base, tierMinQty: "200", tierUnitPrice: "9" }).priceTiers).toHaveLength(1);
    expect(quoteSchema.parse(base).priceTiers).toEqual([]);
  });
  it("rejects tiers at or below the quoted quantity, duplicates and missing prices", () => {
    expect(quoteSchema.safeParse({ ...base, tierMinQty: "100", tierUnitPrice: "9" }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...base, tierMinQty: ["200", "200"], tierUnitPrice: ["9", "8"] }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...base, tierMinQty: "200", tierUnitPrice: "" }).success).toBe(false);
  });
});

describe("productSchema", () => {
  const product = {
    title: "Mailer box", categorySlug: "mailers", description: "E-flute", moq: "100", unit: "pcs",
    indicativePrice: "32.50", leadDays: "", returnClass: "custom",
  };
  it("parses pesos to centavos, blank lead time to null, tiers sorted", () => {
    const r = productSchema.safeParse({ ...product, tierMinQty: ["1000", "500"], tierUnitPrice: ["25", "28.75"] });
    expect(r.data).toMatchObject({
      indicativePrice: 3250, leadDays: null, listingType: "product",
      priceTiers: [{ minQty: 500, unitPriceCentavos: 2875 }, { minQty: 1000, unitPriceCentavos: 2500 }],
    });
  });
  it("rejects a tier at or below the MOQ", () => {
    expect(productSchema.safeParse({ ...product, tierMinQty: "100", tierUnitPrice: "20" }).success).toBe(false);
  });
});
