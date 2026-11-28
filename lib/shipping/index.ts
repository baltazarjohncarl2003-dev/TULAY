import "server-only";
import { assertFakesAllowed } from "@/lib/env";
import { fakeCourier } from "./fake";
import { lalamoveCourier } from "./lalamove";
import { ninjavanCourier } from "./ninjavan";
import type { CourierProvider } from "./types";

export type { Booking, CourierAction, CourierProvider, CourierQuote, ShipmentStatus, ShipTo, TrackingEvent, Vehicle } from "./types";

/** The configured courier. The fake one runs in development, tests and Vercel previews only. */
export function getCourier(): CourierProvider {
  const name = process.env.COURIER_PROVIDER ?? "fake";
  if (name === "lalamove") return lalamoveCourier;
  if (name === "ninjavan") return ninjavanCourier;
  if (name === "fake") {
    assertFakesAllowed("The fake courier");
    return fakeCourier;
  }
  throw new Error(`Unknown COURIER_PROVIDER "${name}"`);
}
