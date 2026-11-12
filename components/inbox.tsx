"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Field, useServerForm } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendRfqMessage } from "@/lib/actions/deals";
import { date } from "@/lib/format";
import { filterThreads, type Thread } from "@/lib/threads";
import { messageSchema } from "@/lib/validation/forms";
import { cn } from "@/lib/utils";

// Matches send_rfq_message: threads close when the request is cancelled (declined invites have no thread).
const CLOSED = ["cancelled"];

function Composer({ rfqId, supplierId, closed }: { rfqId: string; supplierId: string; closed: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { errors, onSubmit, pending } = useServerForm(
    messageSchema,
    (raw) => sendRfqMessage(rfqId, supplierId, raw),
    "Message sent",
    () => formRef.current?.reset(),
  );
  if (closed) return <Notice>Messaging is closed for this request.</Notice>;
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <Field label="Message" name="body" errors={errors}>
        <Textarea id="body" name="body" maxLength={2000} placeholder="Write a message…" />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Send
        </Button>
      </div>
    </form>
  );
}

/** Two-pane business inbox. viewerId is the sender id of the signed-in user, used to align their messages. */
export function Inbox({ threads, role, viewerId }: { threads: Thread[]; role: "buyer" | "supplier"; viewerId: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = useRef(new Map<string, HTMLButtonElement>());

  const shown = filterThreads(threads, query);
  const current = shown.find((t) => t.id === selectedId) ?? shown[0];

  function back() {
    setMobileOpen(false);
    if (current) requestAnimationFrame(() => items.current.get(current.id)?.focus());
  }

  return (
    <>
      <PageHeader
        eyebrow="Business messages"
        title="Inbox"
        description="Each conversation is tied to a sourcing request and one supplier."
      />

      {threads.length === 0 ? (
        <EmptyState
          title={`No conversations yet. They start when ${
            role === "buyer" ? "a supplier is invited to your request" : "you are invited to a request"
          }.`}
        />
      ) : (
        <div className="grid min-h-[32rem] overflow-hidden rounded-xl border bg-card md:grid-cols-[20rem_1fr]">
          <div className={cn("flex-col border-b md:flex md:border-r md:border-b-0", mobileOpen ? "hidden" : "flex")}>
            <div className="border-b p-3">
              <Input
                type="search"
                aria-label="Search conversations"
                placeholder="Search conversations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {shown.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No conversations match.</p>
            ) : (
              <ul className="flex flex-col overflow-y-auto">
                {shown.map((t) => {
                  const last = t.messages.at(-1);
                  return (
                    <li key={t.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) items.current.set(t.id, el);
                          else items.current.delete(t.id);
                        }}
                        aria-current={t.id === current?.id ? "true" : undefined}
                        onClick={() => {
                          setSelectedId(t.id);
                          setMobileOpen(true);
                        }}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                          t.id === current?.id && "md:bg-muted",
                        )}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{t.counterpartyName}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{date(t.lastAt)}</span>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t.rfqRef} · {t.product}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {last ? last.body : "No messages yet"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {current && (
            <section
              aria-label={`Conversation with ${current.counterpartyName}`}
              className={cn("min-w-0 flex-col md:flex", mobileOpen ? "flex" : "hidden")}
            >
              <header className="flex flex-col gap-2 border-b p-3">
                <Button variant="ghost" size="sm" className="w-fit md:hidden" onClick={back}>
                  <ArrowLeftIcon aria-hidden /> Back to inbox
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{current.counterpartyName}</h2>
                  <span className="text-xs text-muted-foreground">{current.rfqRef}</span>
                  <StatusPill status={current.rfqStatus} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/${role}/rfqs/${current.rfqId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Open RFQ
                  </Link>
                  {role === "buyer" && (
                    <Link href={`/suppliers/${current.supplierId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Supplier profile
                    </Link>
                  )}
                  {current.latestQuoteRef && (
                    <span className="text-muted-foreground">Latest quote: {current.latestQuoteRef}</span>
                  )}
                </div>
              </header>

              <div role="log" aria-live="polite" className="flex max-h-96 flex-1 flex-col gap-3 overflow-y-auto p-3">
                {current.messages.length ? (
                  current.messages.map((m) => {
                    const mine = m.senderId === viewerId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                          mine ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted",
                        )}
                      >
                        <p className="whitespace-pre-line">{m.body}</p>
                        <span className={cn("mt-1 block text-xs", mine ? "opacity-80" : "text-muted-foreground")}>
                          {date(m.createdAt)}
                          {mine && " · Sent"}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
                )}
              </div>

              <div className="border-t p-3">
                <Composer
                  key={current.id}
                  rfqId={current.rfqId}
                  supplierId={current.supplierId}
                  closed={CLOSED.includes(current.rfqStatus)}
                />
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
