import type { AdminSubRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

/** `roles`: admin sub-roles that may use the page (super_admin always may); omitted means every admin. */
export type NavItem = { href: string; label: string; roles?: AdminSubRole[] };

export const ROLE_NAV: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/buyer", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/buyer/rfqs", label: "My RFQs" },
    { href: "/buyer/saved", label: "Saved" },
    { href: "/buyer/cart", label: "Cart" },
    { href: "/buyer/orders", label: "Orders" },
    { href: "/buyer/claims", label: "Claims" },
    { href: "/buyer/addresses", label: "Addresses" },
    { href: "/buyer/rfqs/new", label: "New Request" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/buyer/messages", label: "Messages" },
    { href: "/buyer/notifications", label: "Notifications" },
    { href: "/buyer/account", label: "My Account" },
  ],
  supplier: [
    { href: "/supplier", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/supplier/products", label: "Products" },
    { href: "/supplier/profile", label: "Company Profile" },
    { href: "/supplier/auto-matching", label: "Auto Matching" },
    { href: "/supplier/invites", label: "RFQ Invitations" },
    { href: "/supplier/quotes", label: "Quotations" },
    { href: "/supplier/orders", label: "Orders" },
    { href: "/supplier/claims", label: "Claims" },
    { href: "/supplier/reviews", label: "Reviews" },
    { href: "/supplier/payouts", label: "Payouts" },
    { href: "/supplier/messages", label: "Messages" },
    { href: "/supplier/notifications", label: "Notifications" },
    { href: "/supplier/account", label: "My Account" },
  ],
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
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
    { href: "/admin/messages", label: "Messages", roles: ["support"] },
    { href: "/admin/notifications", label: "Notifications" },
    { href: "/admin/account", label: "My Account" },
  ],
};

export const PUBLIC_NAV: NavItem[] = [
  { href: "/marketplace", label: "Products" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/marketplace?type=service", label: "Services" },
  { href: "/buyer/rfqs/new", label: "Request for Quotation" },
  { href: "/how-it-works", label: "How It Works" },
];
