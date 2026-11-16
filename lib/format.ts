import type { Quote } from "@/lib/types";
import { compareQuotes } from "@/lib/quotes";

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

/** Centavos to a peso form field value ("1250.50"), integer math only. null stays blank. */
export function centavosToInput(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  if (!Number.isInteger(centavos) || centavos < 0) throw new Error("Money must be non-negative integer centavos");
  return `${Math.trunc(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

export const qty = (n: number) => n.toLocaleString("en-PH");

const TZ = "Asia/Manila";
/** Calendar date (YYYY-MM-DD) in Philippine time; "—" when missing. */
export const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }) : "—");
/** Date and 24-hour time (YYYY-MM-DD HH:mm) in Philippine time. */
export const dateTime = (iso: string) =>
  `${date(iso)} ${new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}`;
/** Today's calendar date (YYYY-MM-DD) in Philippine time. */
export const todayManila = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const label = (s: string) => s.replace(/_/g, " ");

/** Known total at the quoted quantity, with the same tier pricing as compareQuotes. Display only; the server recomputes. */
export function quoteKnownTotal(q: Quote): { totalCentavos: number; partial: boolean } {
  const [row] = compareQuotes([q], q.quantity);
  return { totalCentavos: row.totalCentavos, partial: row.missing.length > 0 };
}

// Style guide (docs/style-guide.md): small words stay lowercase inside Title Case unless they come first.
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
/** Title Case for menus, categories and headings; existing capitals (DTF, IDs, TULAY) are kept. */
export const titleCase = (s: string) =>
  s.replace(/[A-Za-z][\w']*/g, (w, i: number) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)));
/** Sentence case for status pills and table cells: "in_production" -> "In production". */
export const sentence = (s: string) => {
  const t = label(s);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
