import { MessagesList } from "@/components/messages-list";

export const metadata = { title: "Messages" };

export default function Page() {
  return <MessagesList role="admin" />;
}
