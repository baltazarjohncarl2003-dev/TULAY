/** One-time message shown after a server redirect (read and cleared by components/flash-toast). */
export const FLASH_COOKIE = "tulay_flash";

export const FLASH_MESSAGES = {
  confirmed: "Email confirmed. Welcome to TULAY!",
  signed_in: "Signed in. Welcome back!",
  password_updated: "Password updated. You're signed in.",
  ninjavan_connected: "Ninja Van connected. You can now book pickups.",
} as const;

export const FLASH_ERRORS = {
  ninjavan_failed: "Ninja Van could not be connected. Try again.",
  ninjavan_unavailable: "Ninja Van connection is not available yet.",
} as const;

export type FlashKey = keyof typeof FLASH_MESSAGES | keyof typeof FLASH_ERRORS;

// Not httpOnly: the browser reads and deletes it. It holds only a key, never user data.
export const FLASH_OPTIONS = { path: "/", maxAge: 60, sameSite: "lax" as const };
