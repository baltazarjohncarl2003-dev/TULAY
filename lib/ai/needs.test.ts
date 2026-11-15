import { afterEach, describe, expect, it, vi } from "vitest";
import { aiSplitNeeds } from "./needs";

const reply = (text: string, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: ok ? 200 : 500 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("aiSplitNeeds", () => {
  it("returns null without a key and never calls Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetch = reply("{}");
    vi.stubGlobal("fetch", fetch);
    expect(await aiSplitNeeds("500 mailer boxes")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps valid needs and drops duplicates", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    const needs = [
      { text: "mailer boxes", quantity: 500 },
      { text: "Mailer Boxes", quantity: null },
      { text: "thermal labels", quantity: null },
    ];
    vi.stubGlobal("fetch", reply(JSON.stringify({ needs })));
    expect(await aiSplitNeeds("500 mailer boxes and thermal labels")).toEqual([needs[0], needs[2]]);
  });

  it("falls back (null) on bad output or an HTTP error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", reply(JSON.stringify({ needs: [{ text: "boxes", quantity: -5 }] })));
    expect(await aiSplitNeeds("boxes")).toBeNull();
    vi.stubGlobal("fetch", reply("not json"));
    expect(await aiSplitNeeds("boxes")).toBeNull();
    vi.stubGlobal("fetch", reply("{}", false));
    expect(await aiSplitNeeds("boxes")).toBeNull();
  });
});
