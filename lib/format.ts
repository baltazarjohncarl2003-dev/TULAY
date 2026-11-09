import type { Quote } from "@/lib/demo/types";

/** Format integer centavos as PHP. null means "not provided", never zero. */
export function php(centavos: number | null): string {
  if (centavos === null) return "Not provided";
  if (!Number.isInteger(centavos)) throw new Error("Money must be integer centavos");
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100).toLocaleString("en-PH");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}₱${pesos}.${cents}`;
}

/** Parse a peso amount typed in a form ("1,250.5") into integer centavos without float math. */
export function toCentavos(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (s === "") return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error("Enter a peso amount with at most 2 decimals");
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export const qty = (n: number) => n.toLocaleString("en-PH");
export const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
export const label = (s: string) => s.replace(/_/g, " ");

/** Known total = qty × unit price + every fee that was provided. Display only; the server recomputes. */
export function quoteKnownTotal(q: Quote): { totalCentavos: number; partial: boolean } {
  const fees = [q.setupFeeCentavos, q.shippingFeeCentavos, q.taxCentavos];
  const total = q.quantity * q.unitPriceCentavos + fees.reduce<number>((a, f) => a + (f ?? 0), 0);
  return { totalCentavos: total, partial: fees.some((f) => f === null) };
}
