import "server-only";

// Ninja Van audit rule: retry 5xx and network failures; on 4xx log the response and do NOT resend the same
// request until it is fixed. Callers send the same idempotent request each attempt (requested tracking number).

export const MAX_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendWithRetry(
  send: () => Promise<Response>,
  opts: { label: string; sleep?: (ms: number) => Promise<void> },
): Promise<Response> {
  const sleep = opts.sleep ?? wait;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await send();
      if (res.status < 500) {
        if (res.status >= 400) {
          // Error bodies describe the request fault; never log the request itself (buyer address and phone).
          console.error(`ninjavan ${opts.label} ${res.status}`, (await res.clone().text()).slice(0, 2000));
        }
        return res;
      }
      lastError = new Error(`ninjavan ${opts.label} ${res.status}`);
    } catch (e) {
      lastError = e; // network failure: safe to retry the same idempotent request
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError;
}
