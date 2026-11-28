// The reset cookie used to hold the plain user id, which anyone holding a session could set themselves.
// Signing it on the server means only /auth/confirm (after a real reset link) can mint it.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Matches the cookie maxAge in /auth/confirm.
const LIFETIME_MS = 15 * 60 * 1000;

function key(): string {
  const k = process.env.SUPABASE_SECRET_KEY;
  if (!k) throw new Error("SUPABASE_SECRET_KEY is not set");
  return k;
}

const sign = (userId: string, expiresAt: number) =>
  createHmac("sha256", key()).update(`tulay_reset:${userId}:${expiresAt}`).digest("hex");

/** Value for RESET_COOKIE: proof, signed by this server, that this user just used a reset link. */
export function signResetProof(userId: string, now: number = Date.now()): string {
  const expiresAt = now + LIFETIME_MS;
  return `${userId}.${expiresAt}.${sign(userId, expiresAt)}`;
}

/** True only for an unexpired proof that this server signed for this user. Never throws on a bad cookie value. */
export function verifyResetProof(value: string | undefined, userId: string, now: number = Date.now()): boolean {
  key(); // a missing secret is a misconfiguration, not a bad cookie
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, expiry, signature] = parts;
  if (id !== userId || !/^\d+$/.test(expiry)) return false;
  const expiresAt = Number(expiry);
  if (expiresAt <= now) return false;
  const expected = Buffer.from(sign(userId, expiresAt));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
