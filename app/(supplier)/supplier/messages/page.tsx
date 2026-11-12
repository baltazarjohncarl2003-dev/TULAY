import { Inbox } from "@/components/inbox";
import { loadDeals } from "@/lib/data/deals";
import { buildThreads } from "@/lib/threads";

export const metadata = { title: "Messages" };

export default async function Page() {
  const deals = await loadDeals();
  const threads = buildThreads(deals, "supplier", { userId: deals.viewer.userId, supplierId: deals.viewer.supplierId });
  return <Inbox threads={threads} role="supplier" viewerId={deals.viewer.userId} />;
}
