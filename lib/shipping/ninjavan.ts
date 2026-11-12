import "server-only";
import type { CourierProvider } from "./types";

// TODO(ninjavan): wire after the business permit and Ninja Van Plugin API access. Each supplier connects
// its own Ninja Pro account by OAuth; book on that account (COD then remits to the supplier). Implement
// from the official Plugin API docs only (OAuth, order creation, waybill, webhook signature). No guesses.
function notConfigured(): never {
  throw new Error("Ninja Van is not configured yet (waiting for the business permit). Use COURIER_PROVIDER=fake locally.");
}

export const ninjavanCourier: CourierProvider = {
  name: "ninjavan",
  book: async () => notConfigured(),
  verifyWebhook: () => notConfigured(),
};
