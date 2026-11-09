import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Browser Supabase client. Read-only UI use plus RLS-guarded uploads; anything touching money, stock, offers or order status goes through the server. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
