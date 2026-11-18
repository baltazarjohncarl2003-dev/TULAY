import { describe, expect, it } from "vitest";
import { activeItem, type NavLink } from "./mobile-menu";

const NAV: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/marketplace", label: "Products" },
  { href: "/marketplace?type=service", label: "Services" },
  { href: "/suppliers", label: "Suppliers" },
];

const pick = (items: NavLink[], pathname: string, query = "") =>
  activeItem(items, pathname, new URLSearchParams(query))?.label;

describe("activeItem", () => {
  it("picks Products or Services by query on /marketplace", () => {
    expect(pick(NAV, "/marketplace", "")).toBe("Products");
    expect(pick(NAV, "/marketplace", "type=service")).toBe("Services");
    expect(pick(NAV, "/marketplace", "q=shirt&type=service")).toBe("Services");
    expect(pick(NAV, "/marketplace", "q=shirt")).toBe("Products");
  });

  it("matches home exactly and path prefixes for nested pages", () => {
    expect(pick(NAV, "/")).toBe("Home");
    expect(pick(NAV, "/suppliers/abc")).toBe("Suppliers");
    expect(pick(NAV, "/how-it-works")).toBeUndefined();
  });

  it("prefers the longest path for bottom tabs", () => {
    const tabs = [
      { href: "/buyer", label: "Account" },
      { href: "/buyer/messages", label: "Messages" },
    ];
    expect(activeItem(tabs, "/buyer/messages", new URLSearchParams())?.href).toBe("/buyer/messages");
  });
});
