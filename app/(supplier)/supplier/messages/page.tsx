import { Inbox } from "@/components/inbox";
import { DEMO_SUPPLIER, DEMO_USERS } from "@/lib/demo/data";
import { buildThreads } from "@/lib/demo/threads";

export const metadata = { title: "Messages" };

export default function Page() {
  const threads = buildThreads("supplier", { buyerId: DEMO_USERS.buyer.id, supplierId: DEMO_SUPPLIER.id });
  return <Inbox threads={threads} role="supplier" viewerId={DEMO_SUPPLIER.ownerId} />;
}
