import "server-only";

// Ninja Van audit rule: store the token with its expiry; get a new one only within 5 minutes of expiry or
// after a 401. Storage and the token call are injected (TULAY's one token in Vault in production, memory in tests).

export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type StoredToken = { accessToken: string; expiresAt: number }; // expiresAt: epoch ms

export type TokenSource<T extends StoredToken = StoredToken> = {
  store: { load(): Promise<T | null>; save(token: T): Promise<void> };
  /** Gets a new token; receives the saved one (for its refresh token), if any. */
  fetchToken: (saved: T | null) => Promise<T>;
  now?: () => number;
};

async function freshToken<T extends StoredToken>(src: TokenSource<T>, saved: T | null): Promise<string> {
  const token = await src.fetchToken(saved);
  await src.store.save(token);
  return token.accessToken;
}

export async function getAccessToken<T extends StoredToken>(src: TokenSource<T>): Promise<string> {
  const now = (src.now ?? Date.now)();
  const saved = await src.store.load();
  if (saved && saved.expiresAt - now > REFRESH_MARGIN_MS) return saved.accessToken;
  return freshToken(src, saved);
}

/** Runs a call with the saved token; on a 401 gets one new token and tries once more (never loops). */
export async function withAccessToken<T extends StoredToken>(
  src: TokenSource<T>,
  call: (token: string) => Promise<Response>,
): Promise<Response> {
  const res = await call(await getAccessToken(src));
  if (res.status !== 401) return res;
  return call(await freshToken(src, await src.store.load()));
}
