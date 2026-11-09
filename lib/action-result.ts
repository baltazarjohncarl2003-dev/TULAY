import { z } from "zod";

/** What every Server Action returns to the browser. */
export type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/** Server-side validation of raw form input. Never trust the browser's own check. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  raw: unknown,
): { ok: true; data: z.output<S> } | { ok: false; error: string; fieldErrors: Record<string, string[] | undefined> } {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>,
  };
}

// Our Postgres functions raise these codes with messages written for users; anything else stays generic.
const USER_FACING_CODES = new Set(["42501", "22023", "P0002", "23514"]);

export function dbError(error: { code?: string; message: string } | null): ActionResult {
  if (error?.code && USER_FACING_CODES.has(error.code) && !error.message.startsWith("permission denied")) {
    return { ok: false, error: error.message };
  }
  if (error?.code === "42501") return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: "Something went wrong. Please try again." };
}
