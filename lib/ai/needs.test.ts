import { afterEach, describe, expect, it, vi } from "vitest";
import { aiBasketTurn } from "./needs";

const reply = (text: string, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: ok ? 200 : 500 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("aiBasketTurn", () => {
  it("returns null without a key and never calls Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetch = reply("{}");
    vi.stubGlobal("fetch", fetch);
    expect(await aiBasketTurn(["500 mailer boxes"], [], 10)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps valid needs, drops duplicates and caps the list", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    const needs = [
      { text: "mailer boxes", quantity: 500, preference: "cheapest" },
      { text: "Mailer Boxes", quantity: null, preference: "cheapest" },
      { text: "thermal labels", quantity: null, preference: "fastest" },
      { text: "packing tape", quantity: 20, preference: "cheapest" },
    ];
    vi.stubGlobal("fetch", reply(JSON.stringify({ reply: "Got it.", needs })));
    expect(await aiBasketTurn(["500 mailer boxes, labels, tape"], [], 2)).toEqual({
      reply: "Got it.",
      needs: [needs[0], needs[2]],
    });
  });

  it("sends the current list and every message to Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    const fetch = reply(JSON.stringify({ reply: "", needs: [] }));
    vi.stubGlobal("fetch", fetch);
    const current = [{ text: "mugs", quantity: 100, preference: "cheapest" as const }];
    await aiBasketTurn(["100 mugs", "make it 200"], current, 10);
    const sent = JSON.parse(JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).contents[0].parts[0].text);
    expect(sent).toEqual({ messages: ["100 mugs", "make it 200"], currentList: current });
  });

  it("falls back (null) on bad output or an HTTP error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", reply(JSON.stringify({ reply: "", needs: [{ text: "boxes", quantity: -5, preference: "cheapest" }] })));
    expect(await aiBasketTurn(["boxes"], [], 10)).toBeNull();
    vi.stubGlobal("fetch", reply(JSON.stringify({ needs: [{ text: "boxes", quantity: 5, preference: "soon" }] })));
    expect(await aiBasketTurn(["boxes"], [], 10)).toBeNull();
    vi.stubGlobal("fetch", reply("not json"));
    expect(await aiBasketTurn(["boxes"], [], 10)).toBeNull();
    vi.stubGlobal("fetch", reply("{}", false));
    expect(await aiBasketTurn(["boxes"], [], 10)).toBeNull();
  });
});
