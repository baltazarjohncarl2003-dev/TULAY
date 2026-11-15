import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canAdmin, requireRole } from "@/lib/auth";
import { listClaimThreads, listContactMessages } from "@/lib/data/admin";
import { dateTime } from "@/lib/format";
import { CONTACT_TOPICS } from "@/lib/validation/forms";
import { NeedsRole } from "../orders/list-controls";
import { HandleButton } from "./handle-button";

export const metadata = { title: "Messages" };

export default async function Page() {
  const user = await requireRole("admin");
  const support = canAdmin(user, "support");
  const [contact, claims] = support ? await Promise.all([listContactMessages(), listClaimThreads()]) : [[], []];
  const open = contact.filter((m) => !m.handledAt).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Support"
        title="Messages"
        description="Contact form messages and claim threads."
      />
      {!support ? (
        <NeedsRole role="support" />
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="text-lg font-semibold">
              Contact messages ({open} open)
            </h2>
            {contact.length === 0 ? (
              <EmptyState title="No contact messages yet." as="h3" />
            ) : (
              contact.map((m) => {
                const privacy = m.topic.startsWith("privacy_");
                return (
                  <Card key={m.id}>
                    <CardHeader>
                      <CardTitle>
                        {CONTACT_TOPICS[m.topic as keyof typeof CONTACT_TOPICS] ?? m.topic}
                        {privacy && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">Privacy request</span>}
                      </CardTitle>
                      <CardAction>{m.handledAt ? <StatusPill status="resolved" /> : <HandleButton id={m.id} />}</CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1 text-sm">
                      <p className="whitespace-pre-wrap">{m.message}</p>
                      <p className="text-muted-foreground">
                        {m.name} · <a href={`mailto:${m.email}`} className="underline">{m.email}</a>
                        {m.reference && ` · Ref ${m.reference}`} · {dateTime(m.createdAt)}
                        {m.userId && <> · <Link href={`/admin/users?q=${m.userId}`} className="underline">Account</Link></>}
                        {m.handledAt && ` · Handled ${dateTime(m.handledAt)}`}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="claims-heading">
            <h2 id="claims-heading" className="text-lg font-semibold">
              Claim threads
            </h2>
            {claims.length === 0 ? (
              <EmptyState title="No claims yet." as="h3" />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <Link href={`/admin/claims/${c.id}`} className="font-medium text-primary hover:underline">
                      {c.ref}
                    </Link>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <StatusPill status={c.status} /> {dateTime(c.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Sourcing request conversations are on each request in the <Link href="/admin/rfqs" className="text-primary underline">RFQ queue</Link>.
      </p>
    </div>
  );
}
