/** Header the proxy sets to the requested path + query, so server guards can send visitors back after sign-in. */
export const PATH_HEADER = "x-tulay-path";

/** A same-site path to return to after sign-in, or null. Rejects absolute, protocol-relative and auth-page targets. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return null;
  const url = new URL(raw, "http://same.site");
  if (url.origin !== "http://same.site") return null;
  if (url.pathname === "/login" || url.pathname === "/mfa") return null;
  return url.pathname + url.search;
}
