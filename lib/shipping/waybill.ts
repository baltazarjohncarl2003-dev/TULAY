import "server-only";
import bwipjs from "bwip-js/node";

// Own waybills (Ninja Van interface guideline): QR code and Code-128 barcode, both of the tracking number.
// Printing our own label means no Waybill API audit and no label API calls.

const SAFE_REF = /^[A-Za-z0-9-]{1,100}$/;

/** SVG markup for both codes, or null for a tracking ref we would not print (never expected; refs are validated). */
export function waybillCodes(trackingRef: string): { qr: string; code128: string } | null {
  if (!SAFE_REF.test(trackingRef)) return null;
  return {
    qr: bwipjs.toSVG({ bcid: "qrcode", text: trackingRef }),
    code128: bwipjs.toSVG({ bcid: "code128", text: trackingRef, height: 14 }),
  };
}
