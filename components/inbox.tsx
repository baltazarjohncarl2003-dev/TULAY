"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, SendIcon } from "lucide-react";
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

// Same Philippine time zone as lib/format.ts, so bubble times agree with the day separators.
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" });

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

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
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex items-end gap-2">
      {/* The visible label is hidden in the chat composer; the textarea keeps its accessible name. */}
      <Field label="Message" name="body" errors={errors} className="min-w-0 flex-1 [&>label]:sr-only">
        <Textarea
          id="body"
          name="body"
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          className="max-h-40 min-h-9 resize-none"
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a line. Enter never adds a line, so an empty Enter does nothing.
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!pending && e.currentTarget.value.trim()) formRef.current?.requestSubmit();
          }}
        />
      </Field>
      <Button type="submit" size="icon-lg" aria-label="Send message" disabled={pending} className="rounded-full">
        <SendIcon aria-hidden />
      </Button>
    </form>
  );
}

/** Two-pane business inbox. viewerId is the sender id of the signed-in user, used to align their messages. */
export function Inbox({ threads, role, viewerId }: { threads: Thread[]; role: "buyer" | "supplier"; viewerId: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = useRef(new Map<string, HTMLButtonElement>());
  const log = useRef<HTMLDivElement>(null);

  const shown = filterThreads(threads, query);
  const current = shown.find((t) => t.id === selectedId) ?? shown[0];

  // Opens on the newest message: when a thread is opened, and when a message is added (router.refresh after send).
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [current?.id, current?.messages.length, mobileOpen]);

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
        <div className="grid h-[70vh] min-h-[28rem] grid-cols-1 overflow-hidden rounded-xl border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div
            className={cn(
              "min-h-0 flex-col border-b lg:flex lg:border-r lg:border-b-0",
              mobileOpen ? "hidden" : "flex",
            )}
          >
            <div className="shrink-0 border-b p-3">
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
              <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {shown.map((t) => {
                  const last = t.messages.at(-1);
                  const selected = t.id === current?.id;
                  return (
                    <li key={t.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) items.current.set(t.id, el);
                          else items.current.delete(t.id);
                        }}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => {
                          setSelectedId(t.id);
                          setMobileOpen(true);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected && "lg:bg-primary/10",
                        )}
                      >
                        <Avatar name={t.counterpartyName} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
              className={cn("min-h-0 min-w-0 flex-col lg:flex", mobileOpen ? "flex" : "hidden")}
            >
              <header className="flex shrink-0 flex-col gap-2 border-b p-3">
                <Button variant="ghost" size="sm" className="w-fit lg:hidden" onClick={back}>
                  <ArrowLeftIcon aria-hidden /> Back to inbox
                </Button>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={current.counterpartyName} />
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="font-semibold break-words">{current.counterpartyName}</h2>
                    <span className="text-xs text-muted-foreground">{current.rfqRef}</span>
                    <StatusPill status={current.rfqStatus} />
                  </div>
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

              <div
                ref={log}
                role="log"
                aria-live="polite"
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
              >
                {current.messages.length ? (
                  current.messages.flatMap((m, i) => {
                    const mine = m.senderId === viewerId;
                    const day = date(m.createdAt);
                    const newDay = i === 0 || date(current.messages[i - 1].createdAt) !== day;
                    return [
                      newDay && (
                        <div
                          key={`day-${m.id}`}
                          className="self-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {day}
                        </div>
                      ),
                      <div
                        key={m.id}
                        className={cn("flex max-w-[85%] flex-col gap-1", mine ? "ml-auto items-end" : "mr-auto items-start")}
                      >
                        <p
                          className={cn(
                            "rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-line",
                            mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                          )}
                        >
                          {m.body}
                        </p>
                        <time dateTime={m.createdAt} className="text-xs text-muted-foreground">
                          {clock(m.createdAt)}
                          {mine && " · Sent"}
                        </time>
                      </div>,
                    ];
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
                )}
              </div>

              <div className="shrink-0 border-t p-3">
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
