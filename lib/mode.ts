/** Buying or selling: which hub the account last used. One account does both, so this only steers the public ribbon. */
export type Mode = "buying" | "selling";

export const MODE_COOKIE = "tulay_mode";

/** The mode a workspace path implies, or null for any other path. */
export function modeForPath(pathname: string): Mode | null {
  if (pathname === "/buyer" || pathname.startsWith("/buyer/")) return "buying";
  if (pathname === "/supplier" || pathname.startsWith("/supplier/")) return "selling";
  return null;
}

export function parseMode(value: string | undefined): Mode | null {
  return value === "buying" || value === "selling" ? value : null;
}
