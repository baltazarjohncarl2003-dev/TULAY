import "server-only";

// Ninja Van audit rule: retry 5xx and network failures; on 4xx log the fault code and do NOT resend the same
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
          // Log the fault code only: an error body can repeat the request (buyer address and phone).
          const code = (await res.clone().json().catch(() => null))?.error?.code;
          console.error(`${opts.label} ${res.status}`, code ?? "");
        }
        return res;
      }
      lastError = new Error(`${opts.label} ${res.status}`);
    } catch (e) {
      lastError = e; // network failure: safe to retry the same idempotent request
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError;
}
