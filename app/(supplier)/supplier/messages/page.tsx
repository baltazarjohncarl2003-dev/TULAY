import { notFound } from "next/navigation";
import { ChatPage } from "@/components/chat-panel";
import { loadChats } from "@/lib/data/chats";

export const metadata = { title: "Messages" };

export default async function Page() {
  const data = await loadChats();
  if (!data) notFound();
  return <ChatPage initial={data} />;
}
