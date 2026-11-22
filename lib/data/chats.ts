import "server-only";
import { getSessionUser } from "@/lib/auth";
import { isUnread, rfqChat, sortChats, type Chat, type ChatList } from "@/lib/chats";
import { loadDeals } from "@/lib/data/deals";
import { createClient } from "@/lib/supabase/server";
import { buildThreads } from "@/lib/threads";

/** Every chat the signed-in user is part of, on both their buying and selling side. Null for visitors and admins. */
export async function loadChats(): Promise<ChatList | null> {
  const user = await getSessionUser();
  if (!user || user.role === "admin") return null;
  const deals = await loadDeals();
  const { userId, supplierId } = deals.viewer;
  const supabase = await createClient();

  // shortcut: loads full history on each refresh; page messages per chat once accounts hold thousands.
  const [conversations, messages, reads] = await Promise.all([
    supabase.from("direct_conversations").select("id, buyer_id, supplier_id, buyer_name, last_message_at"),
    supabase.from("direct_messages").select("id, conversation_id, sender_id, body, created_at").order("id"),
    supabase.from("chat_reads").select("thread_id, last_read_at"),
  ]);
  for (const r of [conversations, messages, reads]) if (r.error) throw new Error(r.error.message);

  const readAt = new Map(reads.data!.map((r) => [r.thread_id, r.last_read_at]));
  const supplierIds = [...new Set(conversations.data!.map((c) => c.supplier_id))];
  const names = supplierIds.length
    ? await supabase.from("suppliers").select("id, business_name").in("id", supplierIds)
    : { data: [], error: null };
  if (names.error) throw new Error(names.error.message);
  const supplierName = new Map(names.data!.map((s) => [s.id, s.business_name]));

  const direct: Chat[] = conversations.data!.map((c) => {
    const side = c.buyer_id === userId ? "buyer" : "supplier";
    const thread = messages.data!
      .filter((m) => m.conversation_id === c.id)
      .map((m) => ({ id: String(m.id), senderId: m.sender_id, body: m.body, createdAt: m.created_at }));
    return {
      id: c.id,
      kind: "direct",
      side,
      name: side === "buyer" ? (supplierName.get(c.supplier_id) ?? "Supplier") : c.buyer_name,
      subtitle: "",
      conversationId: c.id,
      rfqId: null,
      supplierId: c.supplier_id,
      href: side === "buyer" ? `/suppliers/${c.supplier_id}` : null,
      closed: false,
      unread: isUnread(thread, userId, readAt.get(c.id)),
      lastAt: thread.at(-1)?.createdAt ?? c.last_message_at,
      messages: thread,
    };
  });

  const viewer = { userId, supplierId };
  const rfq = [
    ...buildThreads(deals, "buyer", viewer).map((t) => rfqChat(t, "buyer", userId, readAt.get(t.id))),
    ...(supplierId ? buildThreads(deals, "supplier", viewer) : []).map((t) => rfqChat(t, "supplier", userId, readAt.get(t.id))),
  ];
  const seen = new Set<string>();
  const chats = sortChats([...direct, ...rfq]).filter((c) => !seen.has(c.id) && seen.add(c.id));
  return { viewerId: userId, supplierId, chats };
}
