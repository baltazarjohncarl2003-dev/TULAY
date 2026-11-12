import "server-only";
import { fakeCourier } from "./fake";
import { ninjavanCourier } from "./ninjavan";
import type { CourierProvider } from "./types";

export type { CourierProvider, ShipmentStatus, ShipTo, TrackingEvent } from "./types";

/** The configured courier. The fake one never runs in Vercel production. */
export function getCourier(): CourierProvider {
  const name = process.env.COURIER_PROVIDER ?? "fake";
  if (name === "ninjavan") return ninjavanCourier;
  if (name === "fake") {
    if (process.env.VERCEL_ENV === "production") throw new Error("The fake courier is disabled in production");
    return fakeCourier;
  }
  throw new Error(`Unknown COURIER_PROVIDER "${name}"`);
}
