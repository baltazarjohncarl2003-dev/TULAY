import { INVITES, latestQuotes, MESSAGES, RFQS, supplierById } from "@/lib/demo/data";
import type { Message, RfqStatus } from "@/lib/types";

export type Thread = {
  id: string; // `${rfqId}:${supplierId}`
  rfqId: string;
  rfqRef: string;
  product: string;
  rfqStatus: RfqStatus;
  supplierId: string;
  supplierName: string;
  counterpartyName: string; // buyer view: supplier name; supplier view: "Buyer · <rfqRef>" (buyers stay anonymous)
  latestQuoteRef: string | null;
  messages: Message[]; // oldest first
  lastAt: string | null;
};

/** One thread per RFQ and invited (not declined) supplier, scoped to the viewer. Newest activity first. */
export function buildThreads(
  role: "buyer" | "supplier",
  viewer: { buyerId: string; supplierId: string },
): Thread[] {
  const threads: Thread[] = [];
  for (const invite of INVITES) {
    if (invite.status === "declined") continue;
    const rfq = RFQS.find((r) => r.id === invite.rfqId);
    if (!rfq) continue;
    if (role === "buyer" ? rfq.buyerId !== viewer.buyerId : invite.supplierId !== viewer.supplierId) continue;

    const supplierName = supplierById(invite.supplierId)?.businessName ?? "Supplier";
    const quote = latestQuotes(rfq.id).find((q) => q.supplierId === invite.supplierId);
    const messages = MESSAGES.filter((m) => m.rfqId === rfq.id && m.supplierId === invite.supplierId).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    threads.push({
      id: `${rfq.id}:${invite.supplierId}`,
      rfqId: rfq.id,
      rfqRef: rfq.ref,
      product: rfq.product,
      rfqStatus: rfq.status,
      supplierId: invite.supplierId,
      supplierName,
      counterpartyName: role === "buyer" ? supplierName : `Buyer · ${rfq.ref}`,
      latestQuoteRef: quote ? `${quote.ref} rev ${quote.revision}` : null,
      messages,
      lastAt: messages.at(-1)?.createdAt ?? null,
    });
  }
  return threads.sort((a, b) => {
    if (a.lastAt && b.lastAt && a.lastAt !== b.lastAt) return b.lastAt.localeCompare(a.lastAt);
    if (!a.lastAt !== !b.lastAt) return a.lastAt ? -1 : 1;
    return a.rfqRef.localeCompare(b.rfqRef);
  });
}

/** Case-insensitive match on RFQ ref, product, counterparty name and message bodies. */
export function filterThreads(threads: Thread[], query: string): Thread[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((t) =>
    [t.rfqRef, t.product, t.counterpartyName, ...t.messages.map((m) => m.body)].some((s) =>
      s.toLowerCase().includes(q),
    ),
  );
}
