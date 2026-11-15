"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getMySaved, setSaved } from "@/lib/actions/catalog";
import { SAVED_PRODUCTS_KEY, SAVED_SUPPLIERS_KEY, useIdList } from "@/lib/saved";

type Kind = "product" | "supplier";
type Saved = { products: string[]; suppliers: string[] };

type SavedItemsValue = {
  signedIn: boolean;
  ids(kind: Kind): string[];
  isSaved(kind: Kind, id: string): boolean;
  toggle(kind: Kind, id: string): void;
};

const SavedItemsContext = createContext<SavedItemsValue | null>(null);

const listKey = (kind: Kind): keyof Saved => (kind === "product" ? "products" : "suppliers");

/**
 * Signed in: saves live in the database. Visitors: saves live in browser storage.
 * Pass `initial` when the page already loaded it (null = visitor); leave it out on static pages and the
 * provider asks the server after mount, so the page itself never waits on the session.
 */
export function SavedItemsProvider({ initial, children }: { initial?: Saved | null; children: React.ReactNode }) {
  // Both hooks run on every render, visitors or not, so the hook order never changes.
  const visitorProducts = useIdList(SAVED_PRODUCTS_KEY);
  const visitorSuppliers = useIdList(SAVED_SUPPLIERS_KEY);
  // undefined = still loading (treated as a visitor until the answer arrives).
  const [signed, setSigned] = useState<Saved | null | undefined>(initial);
  const signedIn = !!signed;
  const visitor = { product: visitorProducts, supplier: visitorSuppliers };

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    getMySaved().then(
      (s) => live && setSigned(s),
      () => live && setSigned(null),
    );
    return () => {
      live = false;
    };
  }, [initial]);

  // P-6: once signed in, move browser saves into the account, then clear the local keys.
  const merging = useRef(false);
  const { ids: localProducts, clear: clearProducts } = visitorProducts;
  const { ids: localSuppliers, clear: clearSuppliers } = visitorSuppliers;
  useEffect(() => {
    if (!signed || merging.current) return;
    const local = [
      ...localProducts.map((targetId) => ({ kind: "product" as const, targetId })),
      ...localSuppliers.map((targetId) => ({ kind: "supplier" as const, targetId })),
    ];
    if (local.length === 0) return;
    merging.current = true;
    Promise.all(local.map((l) => setSaved({ ...l, saved: true }))).then(
      (results) => {
        // Keep local copies if any save failed, so nothing is lost; the next load tries again.
        if (results.every((r) => r.ok)) {
          setSigned((s) =>
            s && {
              products: [...new Set([...s.products, ...localProducts])],
              suppliers: [...new Set([...s.suppliers, ...localSuppliers])],
            },
          );
          clearProducts();
          clearSuppliers();
        }
        merging.current = false;
      },
      () => {
        merging.current = false;
      },
    );
  }, [signed, localProducts, localSuppliers, clearProducts, clearSuppliers]);

  const ids = (kind: Kind) => (signed ? signed[listKey(kind)] : visitor[kind].ids);
  const isSaved = (kind: Kind, id: string) => ids(kind).includes(id);

  const toggle = (kind: Kind, id: string) => {
    if (!signed) {
      visitor[kind].toggle(id);
      return;
    }
    const key = listKey(kind);
    const wasSaved = signed[key].includes(id);
    // Optimistic update; put(wasSaved) reverts this one change if the server refuses it.
    const put = (on: boolean) =>
      setSigned((s) => s && { ...s, [key]: [...s[key].filter((x) => x !== id), ...(on ? [id] : [])] });
    put(!wasSaved);
    setSaved({ kind, targetId: id, saved: !wasSaved }).then(
      (res) => {
        if (!res.ok) {
          put(wasSaved);
          toast.error(res.error);
        }
      },
      () => {
        put(wasSaved);
        toast.error("Something went wrong. Please try again.");
      },
    );
  };

  return (
    <SavedItemsContext.Provider value={{ signedIn, ids, isSaved, toggle }}>{children}</SavedItemsContext.Provider>
  );
}

export function useSavedItems(): SavedItemsValue {
  const value = useContext(SavedItemsContext);
  if (!value) throw new Error("useSavedItems must be used inside SavedItemsProvider");
  return value;
}
