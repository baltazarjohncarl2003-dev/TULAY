import { describe, expect, it } from "vitest";
import { filterChats, isUnread, sortChats, type Chat } from "./chats";

const msg = (senderId: string, createdAt: string, body = "hi") => ({ id: createdAt, senderId, body, createdAt, rfq: null, offerId: null });
const chat = (over: Partial<Chat>): Chat => ({
  id: "c", kind: "direct", side: "buyer", name: "Ana Prints", subtitle: "", conversationId: "c", rfqId: null,
  supplierId: "s", href: null, closed: false, unread: false, lastAt: null, messages: [], offers: [], ...over,
});

describe("isUnread", () => {
  const t1 = "2026-11-22T01:00:00.000Z";
  const t2 = "2026-11-22T02:00:00.000Z";
  it("is unread when the other party wrote and nothing was read", () => expect(isUnread([msg("them", t1)], "me", undefined)).toBe(true));
  it("ignores the viewer's own messages", () => expect(isUnread([msg("me", t2)], "me", undefined)).toBe(false));
  it("is read up to the marker", () => expect(isUnread([msg("them", t1)], "me", t1)).toBe(false));
  it("is unread again after a newer reply", () => expect(isUnread([msg("them", t1), msg("them", t2)], "me", t1)).toBe(true));
  it("compares instants, not timestamp text", () =>
    expect(isUnread([msg("them", "2026-11-22T10:00:00+08:00")], "me", "2026-11-22T02:00:00.000Z")).toBe(false));
});

describe("chat list", () => {
  it("sorts newest first with empty chats last", () => {
    const list = sortChats([chat({ id: "a" }), chat({ id: "b", lastAt: "2026-11-21" }), chat({ id: "c", lastAt: "2026-11-22" })]);
    expect(list.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });
  it("filters by search text and unread", () => {
    const list = [chat({ id: "a", unread: true }), chat({ id: "b", name: "Mugs PH" })];
    expect(filterChats(list, "mugs", "all").map((c) => c.id)).toEqual(["b"]);
    expect(filterChats(list, "", "unread").map((c) => c.id)).toEqual(["a"]);
  });
  it("filters by the other party and by negotiations", () => {
    const withRfq = { ...msg("me", "2026-11-24"), rfq: {} as never };
    const list = [
      chat({ id: "buying" }),
      chat({ id: "selling", side: "supplier" }),
      chat({ id: "quoted", messages: [withRfq] }),
      chat({ id: "request", kind: "rfq" }),
    ];
    expect(filterChats(list, "", "buyers").map((c) => c.id)).toEqual(["selling"]);
    expect(filterChats(list, "", "suppliers").map((c) => c.id)).toEqual(["buying", "quoted", "request"]);
    expect(filterChats(list, "", "negotiations").map((c) => c.id)).toEqual(["quoted", "request"]);
  });
});
