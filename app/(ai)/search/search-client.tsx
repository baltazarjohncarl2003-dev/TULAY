"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpIcon, CoffeeIcon, HotelIcon, InfoIcon, MonitorIcon, PackageIcon, SparklesIcon, type LucideIcon } from "lucide-react";
import { AiBasket } from "@/components/ai-basket";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BasketLine } from "@/lib/matching/basket";
import { parseBudgetCentavos } from "@/lib/matching/needs";
import { proposeBasket } from "./actions";

const MAX_LENGTH = 1000;
const FAILED = "Something went wrong. Try again.";
const PROMPTS: { text: string; Icon: LucideIcon }[] = [
  { text: "Starting a café: disposable cups, coffee beans, POS terminal, budget ₱100,000", Icon: CoffeeIcon },
  { text: "Online shop packaging: 500 mailer boxes and thermal labels", Icon: PackageIcon },
  { text: "Office setup for 10 staff: desks, laptops, bond paper", Icon: MonitorIcon },
  { text: "Hotel opening: amenity kits, uniforms, kitchenware", Icon: HotelIcon },
];

export function SearchClient() {
  const params = useSearchParams();
  // The URL holds the first message, so header-search links and the back button both work.
  // Keying the chat on it resets the conversation whenever it changes.
  const q = (params.get("q") ?? "").slice(0, MAX_LENGTH).trim();
  return <Chat key={q} q={q} />;
}

function Chat({ q }: { q: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>(q ? [q] : []);
  const [replies, setReplies] = useState<string[]>([]);
  const [lines, setLines] = useState<BasketLine[]>([]);
  const latest = useRef(0);
  const reading = replies.length < messages.length;

  // Asks the server; resolves null when a newer turn started so the stale answer is dropped.
  const ask = useCallback(async (msgs: string[], current: BasketLine[]) => {
    const id = ++latest.current;
    let proposal = null;
    try {
      proposal = await proposeBasket({ messages: msgs, needs: current.map((l) => l.need) });
    } catch {
      proposal = null;
    }
    return id === latest.current ? proposal : undefined;
  }, []);

  const show = useCallback((msgs: string[], proposal: BasketLine[] | null, text: string | null) => {
    if (proposal) setLines(proposal);
    setReplies((prev) => [...prev.slice(0, msgs.length - 1), text ?? FAILED]);
  }, []);

  const turn = useCallback(
    (msgs: string[], current: BasketLine[]) =>
      ask(msgs, current).then((proposal) => {
        if (proposal === undefined) return;
        const lines = proposal?.lines ?? null;
        const reply =
          proposal &&
          (proposal.reply ??
            (proposal.lines.length === 0
              ? "Nothing to buy found in that. Try naming products, like “500 mailer boxes”."
              : `Found ${proposal.lines.length} ${proposal.lines.length === 1 ? "item" : "items"} in your request`));
        show(msgs, lines, reply);
      }),
    [ask, show],
  );

  useEffect(() => {
    if (q) void turn([q], []);
  }, [q, turn]);

  const budget = useMemo(() => (messages[0] ? parseBudgetCentavos(messages[0]) : null), [messages]);

  function send(text: string) {
    const clean = text.trim().slice(0, MAX_LENGTH);
    if (!clean || reading) return;
    setDraft("");
    if (messages.length === 0) {
      router.push(`/search?q=${encodeURIComponent(clean)}`, { scroll: false });
      return;
    }
    const next = [...messages, clean];
    setMessages(next);
    void turn(next, lines);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(draft);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="sr-only">AI Mode</h1>

      {messages.length === 0 ? (
        <>
          <div className="flex flex-col items-center gap-4 pt-8 text-center sm:pt-14">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-meta font-medium text-primary">
              <span aria-hidden="true">✨</span> TULAY AI sourcing assistant
            </span>
            <h2 className="text-display text-balance tracking-tight">What does your business need?</h2>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              Describe it in your own words, in English or Tagalog. TULAY AI splits it into separate needs and finds
              matching listings for each.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {PROMPTS.map(({ text, Icon }) => (
              <button
                key={text}
                type="button"
                onClick={() => send(text)}
                className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 text-left text-sm leading-snug shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 pt-1.5">{text}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {messages.map((m, i) => (
            <div key={i} className="flex flex-col gap-6">
              <p className="ml-auto max-w-[85%] rounded-3xl bg-primary/10 px-5 py-3 text-base whitespace-pre-line sm:max-w-[70%]">
                {m}
              </p>
              <div className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SparklesIcon aria-hidden="true" className="size-3.5 text-primary" /> TULAY AI
                </span>
                <p aria-live="polite" className="text-base leading-relaxed whitespace-pre-line">
                  {i < replies.length ? (
                    replies[i]
                  ) : (
                    <span className="animate-pulse text-muted-foreground motion-reduce:animate-none">
                      Reading your request…
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}

          {lines.length > 0 && <AiBasket lines={lines} budgetCentavos={budget} />}
        </>
      )}

      {/* Fixed composer; the fade lets the conversation scroll under it without clashing. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-background via-background/80 to-transparent pt-10">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2 px-4 pb-4">
          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 rounded-2xl border bg-card p-2 pl-4 shadow-lg transition focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/25"
          >
            <label htmlFor="needs-request" className="sr-only">
              Describe your needs
            </label>
            {/* field-sizing-content (from the Textarea base) grows the box with the text; max-h-32 then scrolls. */}
            <Textarea
              id="needs-request"
              name="q"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter adds a line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              maxLength={MAX_LENGTH}
              placeholder={messages.length > 0 ? "Change the list… e.g. make the mugs 200, or faster shirts" : "Describe what your business needs..."}
              className="min-h-0 max-h-32 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-2.5 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={reading || !draft.trim()} aria-label="Send">
              <ArrowUpIcon />
            </Button>
          </form>
          <p className="inline-flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <InfoIcon aria-hidden="true" className="size-3.5" /> Generated by AI. Confirm details with the supplier.
          </p>
        </div>
      </div>
    </div>
  );
}
