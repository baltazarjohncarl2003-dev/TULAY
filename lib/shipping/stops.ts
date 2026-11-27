import type { Stop } from "./types";

// Shared by checkout quotes and bookings: a saved address or pickup row -> a courier stop.
type AddressLike = {
  line1: string;
  line2?: string | null;
  barangay?: string | null;
  city: string;
  province: string;
  postalCode?: string | null;
  postal_code?: string | null;
};

/** "1 Shaw Blvd, Unit 3, Wack-Wack, Mandaluyong, Metro Manila, 1550" (blank parts skipped). */
export function oneLineAddress(a: AddressLike): string {
  return [a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode ?? a.postal_code]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** A courier stop, or null when the address has no map pin yet. */
export function toStop(a: AddressLike & { lat?: number | null; lng?: number | null }): Stop | null {
  if (a.lat == null || a.lng == null) return null;
  return { lat: Number(a.lat), lng: Number(a.lng), address: oneLineAddress(a) };
}
