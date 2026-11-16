import { describe, expect, it } from "vitest";
import { waybillCodes } from "./waybill";

describe("waybill codes", () => {
  it("renders a QR code and a Code-128 barcode of the tracking number", () => {
    const codes = waybillCodes("NVPHTULORD202600012");
    expect(codes?.qr).toMatch(/^<svg[^>]*viewBox/);
    expect(codes?.code128).toMatch(/^<svg[^>]*viewBox/);
    expect(codes?.qr).not.toEqual(codes?.code128);
  });

  it("refuses refs that are not plain tracking numbers", () => {
    expect(waybillCodes('<script>"x"</script>')).toBeNull();
    expect(waybillCodes("")).toBeNull();
  });
});
