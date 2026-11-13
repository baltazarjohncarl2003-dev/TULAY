import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Numeric admin settings from `platform_settings` (readable by everyone under RLS). Request-time data:
 * call it from a component inside <Suspense>. Throws when a key is missing so no default is ever hardcoded.
 */
export async function getNumberSettings<K extends string>(keys: readonly K[]): Promise<Record<K, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_settings").select("key, value").in("key", keys);
  if (error) throw new Error("Could not load settings");
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const v = data.find((r) => r.key === k)?.value;
    if (typeof v !== "number") throw new Error(`Setting ${k} is missing or not a number`);
    out[k] = v;
  }
  return out;
}
