import { notFound } from "next/navigation";
import { ChatPage } from "@/components/chat-panel";
import { getMyProfile } from "@/lib/data/account";
import { loadChats, loadChatTarget } from "@/lib/data/chats";

export const metadata = { title: "Messages" };

type Search = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const [data, target, profile] = await Promise.all([loadChats(), searchParams.then(loadChatTarget), getMyProfile()]);
  if (!data) notFound();
  return <ChatPage initial={data} target={target} rfqDefaults={{ city: profile.city, province: profile.province }} />;
}
