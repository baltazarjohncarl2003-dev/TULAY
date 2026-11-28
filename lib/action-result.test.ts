import { describe, expect, it } from "vitest";
import { dbError } from "./action-result";

const GENERIC = { ok: false, error: "Something went wrong. Please try again." };
const FORBIDDEN = { ok: false, error: "You don't have permission to do that." };
const pass = (message: string) => ({ ok: false, error: message });

describe("dbError", () => {
  it("passes our own messages through", () => {
    expect(dbError({ code: "22023", message: "Messages are 1 to 2000 characters" })).toEqual(pass("Messages are 1 to 2000 characters"));
    expect(dbError({ code: "42501", message: "Sign in first" })).toEqual(pass("Sign in first"));
    const msg = '"vape" is not allowed on TULAY. Remove it and try again.';
    expect(dbError({ code: "23514", message: msg })).toEqual(pass(msg));
  });
  it("hides Postgres's own wording", () => {
    expect(dbError({ code: "42501", message: "permission denied for table orders" })).toEqual(FORBIDDEN);
    expect(dbError({ code: "42501", message: 'new row violates row-level security policy for table "cart_items"' })).toEqual(FORBIDDEN);
    expect(
      dbError({ code: "23514", message: 'new row for relation "profiles" violates check constraint "profiles_phone_check"' }),
    ).toEqual(GENERIC);
  });
  it("keeps other codes and no error generic", () => {
    expect(dbError({ code: "XX000", message: "internal" })).toEqual(GENERIC);
    expect(dbError(null)).toEqual(GENERIC);
  });
});
