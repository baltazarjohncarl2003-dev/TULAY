import type { Role } from "@/lib/types";

export type NavItem = { href: string; label: string };

// Mirrors legacy navButtons() per role.
export const ROLE_NAV: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/buyer", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/search", label: "TULAY AI" },
    { href: "/buyer/rfqs", label: "My RFQs" },
    { href: "/buyer/saved", label: "Saved" },
    { href: "/buyer/rfqs/new", label: "New request" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/buyer/messages", label: "Messages" },
    { href: "/buyer/account", label: "My account" },
  ],
  supplier: [
    { href: "/supplier", label: "Overview" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/search", label: "TULAY AI" },
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
    { href: "/search", label: "TULAY AI" },
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
  { href: "/marketplace", label: "Products" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/search", label: "TULAY AI" },
  { href: "/marketplace?type=service", label: "Services" },
  { href: "/buyer/rfqs/new", label: "Request for quotation" },
  { href: "/how-it-works", label: "How it works" },
];
