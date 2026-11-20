import type { AdminSubRole } from "@/lib/auth";
import type { Mode } from "@/lib/mode";
import type { Role } from "@/lib/types";

/** `roles`: admin sub-roles that may use the page (super_admin always may); omitted means every admin. */
export type NavItem = { href: string; label: string; roles?: AdminSubRole[]; newTab?: boolean; emphasis?: boolean };

export const ROLE_NAV: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/buyer", label: "Overview" },
    { href: "/buyer/profile", label: "Business Profile" },
    { href: "/buyer/rfqs", label: "My RFQs" },
    { href: "/buyer/saved", label: "Saved" },
    { href: "/buyer/cart", label: "Cart" },
    { href: "/buyer/orders", label: "Orders" },
    { href: "/buyer/claims", label: "Claims" },
    { href: "/buyer/addresses", label: "Addresses" },
    { href: "/buyer/rfqs/new", label: "New Request" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/buyer/account", label: "My Account" },
  ],
  supplier: [
    { href: "/supplier", label: "Overview" },
    { href: "/supplier/products", label: "Products" },
    { href: "/supplier/profile", label: "Company Profile" },
    { href: "/supplier/auto-matching", label: "Auto Matching" },
    { href: "/supplier/invites", label: "RFQ Invitations" },
    { href: "/requests", label: "Buyer Requests", newTab: true },
    { href: "/supplier/quotes", label: "Quotations" },
    { href: "/supplier/orders", label: "Orders" },
    { href: "/supplier/claims", label: "Claims" },
    { href: "/supplier/reviews", label: "Reviews" },
    { href: "/supplier/payouts", label: "Payouts" },
    { href: "/supplier/account", label: "My Account" },
  ],
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/products", label: "Review Products", roles: ["verifier"] },
    { href: "/admin/promotions", label: "Campaigns" },
    { href: "/admin/rfqs", label: "RFQ Queue", roles: ["support"] },
    { href: "/admin/suppliers", label: "Supplier Reviews", roles: ["verifier"] },
    { href: "/admin/transactions", label: "Transactions", roles: ["finance", "support"] },
    { href: "/admin/orders", label: "Orders", roles: ["finance", "support"] },
    { href: "/admin/claims", label: "Claims", roles: ["support"] },
    { href: "/admin/reviews", label: "Reviews", roles: ["support"] },
    { href: "/admin/shipments", label: "Shipments", roles: ["support"] },
    { href: "/admin/payments", label: "Payments", roles: ["finance", "support"] },
    { href: "/admin/payouts", label: "Payouts", roles: ["finance"] },
    { href: "/admin/ledger", label: "Ledger", roles: ["finance"] },
    { href: "/admin/users", label: "Users", roles: ["support"] },
    { href: "/admin/settings", label: "Settings", roles: ["super_admin"] },
    { href: "/admin/audit", label: "Audit Log", roles: ["super_admin"] },
    { href: "/admin/account", label: "My Account" },
  ],
};

export const SERVICES_HREF = "/marketplace?type=service";
export const POST_REQUEST_HREF = "/buyer/rfqs/new";
export const BUYER_REQUESTS_HREF = "/requests";

/** The full ribbon. site-header drops Services when none are live, and one request link by buying/selling mode. */
export const PUBLIC_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/search", label: "AI Mode", emphasis: true },
  { href: "/marketplace", label: "Products" },
  { href: SERVICES_HREF, label: "Services" },
  { href: "/suppliers", label: "Suppliers" },
  { href: POST_REQUEST_HREF, label: "Post a Request" },
  { href: BUYER_REQUESTS_HREF, label: "Buyer Requests" },
  { href: "/how-it-works", label: "How It Works" },
];

/** The ribbon for a visitor. `mode` null (signed out, admin) keeps both request links. */
export function publicNav(mode: Mode | null, hasServices: boolean): NavItem[] {
  return PUBLIC_NAV.filter(
    (n) =>
      !(n.href === SERVICES_HREF && !hasServices) &&
      !(mode === "buying" && n.href === BUYER_REQUESTS_HREF) &&
      !(mode === "selling" && n.href === POST_REQUEST_HREF),
  );
}
