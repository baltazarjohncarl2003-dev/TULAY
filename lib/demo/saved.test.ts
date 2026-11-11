import { describe, expect, it } from "vitest";
import { parseIds, toggleId } from "./saved";

describe("toggleId", () => {
  it("adds a missing id", () => {
    expect(toggleId(["a"], "b")).toEqual({ list: ["a", "b"], full: false });
  });
  it("removes an existing id, even when the list is full", () => {
    expect(toggleId(["a", "b"], "a", 2)).toEqual({ list: ["b"], full: false });
  });
  it("refuses to add to a full list", () => {
    expect(toggleId(["a", "b"], "c", 2)).toEqual({ list: ["a", "b"], full: true });
  });
});

describe("parseIds", () => {
  it("returns [] for null, bad JSON and non-arrays", () => {
    expect(parseIds(null)).toEqual([]);
    expect(parseIds("{oops")).toEqual([]);
    expect(parseIds('{"a":1}')).toEqual([]);
  });
  it("drops non-strings and duplicates", () => {
    expect(parseIds('["a",1,null,"b","a"]')).toEqual(["a", "b"]);
  });
});
