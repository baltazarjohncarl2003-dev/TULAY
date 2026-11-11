import { useCallback, useSyncExternalStore } from "react";

// Browser storage: the compare list, and saved items for visitors. Signed-in saves go to the saved_items table
// (setSaved in lib/actions/catalog.ts, listMySaved in lib/data/catalog.ts).

export const COMPARE_MAX = 4;
export const SAVED_PRODUCTS_KEY = "tulay.saved.products";
export const SAVED_SUPPLIERS_KEY = "tulay.saved.suppliers";
export const COMPARE_KEY = "tulay.compare";

const EVENT = "tulay:ids";
const EMPTY: string[] = [];

export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((x): x is string => typeof x === "string"))];
  } catch {
    return [];
  }
}

export function toggleId(list: string[], id: string, max?: number): { list: string[]; full: boolean } {
  if (list.includes(id)) return { list: list.filter((x) => x !== id), full: false };
  if (max !== undefined && list.length >= max) return { list, full: true };
  return { list: [...list, id], full: false };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // private mode or quota: behave as if nothing was saved.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

// Cache per raw string so getSnapshot returns the same array reference until storage changes.
const cache = new Map<string, { raw: string | null; ids: string[] }>();
function snapshot(key: string): string[] {
  const raw = read(key);
  if (raw === null) return EMPTY;
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.ids;
  const ids = parseIds(raw);
  cache.set(key, { raw, ids });
  return ids;
}

export function useIdList(key: string) {
  const ids = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY,
  );
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback(
    (id: string) => {
      const max = key === COMPARE_KEY ? COMPARE_MAX : undefined;
      const res = toggleId(snapshot(key), id, max);
      if (!res.full) write(key, res.list);
      return { full: res.full };
    },
    [key],
  );
  const clear = useCallback(() => write(key, []), [key]);
  return { ids, has, toggle, clear };
}
