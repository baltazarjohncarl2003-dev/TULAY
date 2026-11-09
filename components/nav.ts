import type { Role } from "@/lib/demo/types";

export type NavItem = { href: string; label: string };

// Mirrors legacy navButtons() per role.
export const ROLE_NAV: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/buyer", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/search", label: "Smart sourcing" },
    { href: "/buyer/rfqs", label: "My RFQs" },
    { href: "/buyer/rfqs/new", label: "New request" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/buyer/messages", label: "Messages" },
    { href: "/buyer/account", label: "My account" },
  ],
  supplier: [
    { href: "/supplier", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/search", label: "Smart sourcing" },
    { href: "/supplier/products", label: "Products" },
    { href: "/supplier/profile", label: "Company profile" },
    { href: "/supplier/auto-matching", label: "Auto matching" },
    { href: "/supplier/invites", label: "RFQ invitations" },
    { href: "/supplier/quotes", label: "Quotations" },
    { href: "/supplier/messages", label: "Messages" },
    { href: "/supplier/account", label: "My account" },
  ],
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/search", label: "Smart sourcing" },
    { href: "/admin/products", label: "Review products" },
    { href: "/admin/promotions", label: "Campaigns" },
    { href: "/admin/rfqs", label: "RFQ queue" },
    { href: "/admin/suppliers", label: "Supplier reviews" },
    { href: "/admin/transactions", label: "Transactions" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/audit", label: "Audit log" },
    { href: "/admin/messages", label: "Messages" },
    { href: "/admin/account", label: "My account" },
  ],
};

export const PUBLIC_NAV: NavItem[] = [
  { href: "/marketplace", label: "Explore products" },
  { href: "/search", label: "Smart sourcing" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/how-it-works", label: "How it works" },
];
