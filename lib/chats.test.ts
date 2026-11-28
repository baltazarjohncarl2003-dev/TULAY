import { describe, expect, it } from "vitest";
import { appendInbox, emptyThread, filterChats, mergeMessages, refreshInbox, refreshThread, type ChatList, type ChatMessage, type ChatSummary } from "./chats";

const msg = (id: number, createdAt = `2026-11-22T00:${String(id % 60).padStart(2, "0")}:00.000Z`): ChatMessage => ({
  id: String(id), senderId: "them", body: `m${id}`, createdAt, rfq: null, offerId: null,
});
const chat = (over: Partial<ChatSummary>): ChatSummary => ({
  id: "c", kind: "direct", side: "buyer", name: "Ana Prints", subtitle: "", conversationId: "c", rfqId: null,
  supplierId: "s", href: null, closed: false, unread: false, lastAt: null, lastBody: null, negotiation: false, ...over,
});
const thread = (ids: number[], hasOlder: boolean) => ({ ...emptyThread("2026-11-22T01:00:00.000Z"), messages: ids.map((i) => msg(i)), hasOlder });
const ids = (ms: ChatMessage[]) => ms.map((m) => Number(m.id));

describe("chat list", () => {
  it("filters by search text (name, subtitle, newest message) and unread", () => {
    const list = [chat({ id: "a", unread: true }), chat({ id: "b", name: "Mugs PH" }), chat({ id: "c", lastBody: "Can you do mugs?" })];
    expect(filterChats(list, "mugs", "all").map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterChats(list, "", "unread").map((c) => c.id)).toEqual(["a"]);
  });
  it("filters by the other party and by negotiations", () => {
    const list = [
      chat({ id: "buying" }),
      chat({ id: "selling", side: "supplier" }),
      chat({ id: "quoted", negotiation: true }),
      chat({ id: "request", kind: "rfq", negotiation: true }),
    ];
    expect(filterChats(list, "", "buyers").map((c) => c.id)).toEqual(["selling"]);
    expect(filterChats(list, "", "suppliers").map((c) => c.id)).toEqual(["buying", "quoted", "request"]);
    expect(filterChats(list, "", "negotiations").map((c) => c.id)).toEqual(["quoted", "request"]);
  });
});

describe("inbox paging", () => {
  const at = (h: number) => `2026-11-22T${String(h).padStart(2, "0")}:00:00.000Z`;
  const list = (rows: [string, number][], hasMore: boolean): ChatList => ({
    viewerId: "me", supplierId: null, hasMore, loadedAt: at(23),
    chats: rows.map(([id, h]) => chat({ id, lastAt: at(h) })),
  });
  const shownIds = (l: ChatList) => l.chats.map((c) => c.id);

  it("appends the next page once", () => {
    const next = appendInbox(list([["a", 9], ["b", 8]], true), list([["b", 8], ["c", 7]], false));
    expect(shownIds(next)).toEqual(["a", "b", "c"]);
    expect(next.hasMore).toBe(false);
  });
  it("keeps loaded older pages below a refreshed first page", () => {
    const current = list([["a", 9], ["b", 8], ["c", 7], ["d", 6]], false);
    const next = refreshInbox(current, list([["c", 10], ["a", 9]], true));
    expect(shownIds(next)).toEqual(["c", "a", "b", "d"]);
    expect(next.hasMore).toBe(false);
  });
  it("takes the fresh page alone when it holds every chat", () => {
    expect(shownIds(refreshInbox(list([["a", 9], ["b", 8]], false), list([["b", 10]], false)))).toEqual(["b"]);
  });
});

describe("mergeMessages", () => {
  it("adds an older page in front, oldest first, each message once", () => {
    expect(ids(mergeMessages([msg(3), msg(4)], [msg(1), msg(2), msg(3)]))).toEqual([1, 2, 3, 4]);
  });
  it("orders equal times by id", () => {
    const t = "2026-11-22T00:00:00.000Z";
    expect(ids(mergeMessages([msg(10, t)], [msg(9, t)]))).toEqual([9, 10]);
  });
  it("compares instants, not timestamp text", () => {
    const later = msg(1, "2026-11-22T10:00:00+08:00"); // 02:00 UTC
    const earlier = msg(2, "2026-11-22T01:00:00.000Z");
    expect(ids(mergeMessages([later], [earlier]))).toEqual([2, 1]);
  });
});

describe("refreshThread", () => {
  it("keeps older pages the viewer loaded when the fresh page overlaps", () => {
    const next = refreshThread(thread([1, 2, 3, 4], true), thread([3, 4, 5], true));
    expect(ids(next.messages)).toEqual([1, 2, 3, 4, 5]);
    expect(next.hasOlder).toBe(true);
  });
  it("stops offering older messages once the whole history is on screen", () => {
    expect(refreshThread(thread([1, 2], false), thread([2, 3], true)).hasOlder).toBe(false);
  });
  it("replaces the messages when more than a page arrived in between", () => {
    const next = refreshThread(thread([1, 2], true), thread([5, 6], true));
    expect(ids(next.messages)).toEqual([5, 6]);
    expect(next.hasOlder).toBe(true);
  });
  it("takes the fresh offers and agreements", () => {
    const fresh = { ...thread([2], false), offers: [{ id: "o1" }] as never };
    expect(refreshThread(thread([1], false), fresh).offers).toEqual([{ id: "o1" }]);
  });
});
