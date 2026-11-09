import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client. Read-only UI use; anything touching money, stock, offers or order status goes through the server. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
