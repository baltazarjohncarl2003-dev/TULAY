import "server-only";

/**
 * Fake gateways and courier mocks stand in for the real services. They run in development, in tests and on
 * Vercel preview deployments; a production build anywhere else (Vercel production, a self-hosted server) refuses them.
 */
export function assertFakesAllowed(what: string): void {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") {
    throw new Error(`${what} is disabled in production`);
  }
}
