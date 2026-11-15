import "server-only";
import { createClient } from "@/lib/supabase/server";

// RLS limits notifications to the caller's own rows.

export type Notification = { id: number; title: string; body: string; link: string; readAt: string | null; createdAt: string };

export async function listMyNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.read_at, createdAt: n.created_at }));
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
