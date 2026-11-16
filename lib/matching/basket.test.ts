import { describe, expect, it } from "vitest";
import { rankNeed, type Candidate } from "./basket";
import type { Product, Supplier } from "@/lib/types";

const supplier = (over: Partial<Supplier> = {}): Supplier => ({
  id: "s1", ownerId: "", businessName: "S", legalName: "S", categorySlug: "", city: "", province: "", description: "",
  moq: 1, leadDays: 7, status: "approved", deliveryAreas: [], keywords: "", autoInvites: false, maxQuantity: null,
  businessType: "supplier", yearsOperating: null, ...over,
});
const product = (id: string, over: Partial<Product> = {}): Product => ({
  id, supplierId: "s1", categorySlug: "", title: id, description: "", moq: 100, unit: "pcs",
  indicativePriceCentavos: 1000, leadDays: null, imageUrl: null, status: "approved", returnClass: "standard",
  createdAt: "", listingType: "product", priceTiers: [], variants: [], stock: null, ...over,
});
const cand = (p: Product, s = supplier(), score = 50): Candidate => ({ product: p, supplier: s, score });

describe("rankNeed", () => {
  it("picks the lowest total at the requested quantity, using price tiers", () => {
    const flat = product("flat", { indicativePriceCentavos: 900 });
    const tiered = product("tiered", { indicativePriceCentavos: 1200, priceTiers: [{ minQty: 500, unitPriceCentavos: 800 }] });
    const line = rankNeed({ text: "shirts", quantity: 500, preference: "cheapest" }, [cand(flat), cand(tiered)]);
    expect(line.options.map((o) => o.product.id)).toEqual(["tiered", "flat"]);
    expect(line.options[0]).toMatchObject({ unitCentavos: 800, lineCentavos: 400_000 });
    expect(line.options[0].reasons[0]).toBe("Lowest total at 500 pcs");
  });

  it("ranks by lead time when the buyer wants it fast", () => {
    const slow = product("slow", { indicativePriceCentavos: 500, leadDays: 20 });
    const fast = product("fast", { indicativePriceCentavos: 900, leadDays: 3 });
    const line = rankNeed({ text: "mugs", quantity: 200, preference: "fastest" }, [cand(slow), cand(fast)]);
    expect(line.options[0].product.id).toBe("fast");
  });

  it("puts listings that cannot fill the order last", () => {
    const cheapLowStock = product("low", { indicativePriceCentavos: 100, stock: 50 });
    const bigMoq = product("moq", { indicativePriceCentavos: 200, moq: 1000 });
    const capped = product("cap", { indicativePriceCentavos: 300 });
    const ok = product("ok", { indicativePriceCentavos: 900 });
    const line = rankNeed({ text: "x", quantity: 500, preference: "cheapest" }, [
      cand(cheapLowStock), cand(bigMoq), cand(capped, supplier({ maxQuantity: 100 })), cand(ok),
    ]);
    expect(line.options[0].product.id).toBe("ok");
    expect(line.options.slice(1).every((o) => o.blockers.length > 0)).toBe(true);
  });

  it("prices at the MOQ when no quantity was given and uses the cheapest option as a from-price", () => {
    const p = product("v", {
      moq: 50,
      variants: [
        { id: "a", name: "S", priceDeltaCentavos: 200, stock: null },
        { id: "b", name: "XL", priceDeltaCentavos: 500, stock: null },
      ],
    });
    const [o] = rankNeed({ text: "x", quantity: null, preference: "cheapest" }, [cand(p)]).options;
    expect(o).toMatchObject({ quantity: 50, unitCentavos: 1200, lineCentavos: 60_000, fromPrice: true });
  });

  it("skips unpriced listings, so a need with none goes to quotes", () => {
    const line = rankNeed({ text: "x", quantity: 10, preference: "cheapest" }, [cand(product("p", { indicativePriceCentavos: null }))]);
    expect(line.options).toEqual([]);
  });
});
