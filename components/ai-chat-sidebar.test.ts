import { describe, expect, it } from "vitest";
import { groupChats } from "./ai-chat-sidebar";

const chat = (id: string, updatedAt: string) => ({ id, title: id, updatedAt });
// 08:00 on Nov 22 in Manila.
const now = new Date("2026-11-22T00:00:00.000Z");
const labels = (updatedAt: string) => groupChats([chat("a", updatedAt)], now).map((g) => g.label);

describe("groupChats", () => {
  it("uses Manila calendar days", () => {
    expect(labels("2026-11-21T16:00:00.000Z")).toEqual(["Today"]); // 00:00 Nov 22 Manila
    expect(labels("2026-11-21T15:59:00.000Z")).toEqual(["Yesterday"]); // 23:59 Nov 21 Manila
  });
  it("splits older chats", () => {
    expect(labels("2026-11-15T04:00:00.000Z")).toEqual(["Previous 7 days"]);
    expect(labels("2026-11-14T04:00:00.000Z")).toEqual(["Previous 30 days"]);
    expect(labels("2026-10-01T04:00:00.000Z")).toEqual(["Older"]);
  });
  it("keeps order inside a group", () => {
    const [group] = groupChats([chat("b", "2026-11-21T23:00:00.000Z"), chat("a", "2026-11-21T22:00:00.000Z")], now);
    expect(group.chats.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
