// Couriers a supplier can ship with on its own account. Ids match shipments.carrier.
// shortcut: `site` is each courier's own home page (where its tracking box is), not a deep tracking link;
// add per-courier tracking URLs only after checking each one on the courier's site.

export type CarrierId = "fake" | "ninjavan" | "jnt" | "lbc" | "gogoxpress" | "flash" | "lalamove" | "other";

export const COURIERS: Record<CarrierId, { label: string; site: string | null }> = {
  jnt: { label: "J&T Express", site: "https://www.jtexpress.ph/" },
  lbc: { label: "LBC", site: "https://www.lbcexpress.com/" },
  gogoxpress: { label: "GoGo Xpress", site: "https://www.gogoxpress.com/" },
  ninjavan: { label: "Ninja Van", site: "https://www.ninjavan.co/en-ph" },
  flash: { label: "Flash Express", site: "https://www.flashexpress.ph/" },
  lalamove: { label: "Lalamove", site: "https://www.lalamove.com/en-ph" },
  other: { label: "Other courier", site: null },
  fake: { label: "Test courier", site: null },
};

/** Choices for the supplier's "Enter courier and tracking number" form, in this order. */
export const MANUAL_CARRIERS = ["jnt", "lbc", "gogoxpress", "ninjavan", "flash", "lalamove", "other"] as const;

/** Display name: the supplier-typed name for "other", else the courier's label. */
export function carrierLabel(carrier: string, carrierName = ""): string {
  if (carrier === "other" && carrierName) return carrierName;
  return COURIERS[carrier as CarrierId]?.label ?? carrier;
}
