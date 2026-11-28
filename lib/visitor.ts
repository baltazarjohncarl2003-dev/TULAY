import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Stable id for per-visitor rate limits: the account when signed in (no shared carrier-NAT limit), the IP address
 * otherwise. Hashed, so the database never stores an IP address.
 */
export async function visitorHash(userId: string | null | undefined): Promise<string> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(userId ? `user:${userId}` : `ip:${ip}`).digest("hex");
}
