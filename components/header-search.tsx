"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestListings } from "@/lib/actions/catalog";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

type Scope = "products" | "suppliers" | "services";

const SCOPES: { value: Scope; label: string; path: string; param: string }[] = [
  { value: "products", label: "Products", path: "/marketplace", param: "" },
  { value: "suppliers", label: "Suppliers", path: "/suppliers", param: "" },
  { value: "services", label: "Services", path: "/marketplace", param: "type=service" },
];

type Suggestion = {
  key: string;
  label: string;
  group: string;
  /** Category suggestions ignore the scope; product titles use the scope search. */
  href: (scopeHref: (q: string) => string) => string;
};

export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const uid = useId();
  const listId = `${uid}-list`;
  const [scope, setScope] = useState<Scope>("products");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Product titles are tagged with the query they answer, so stale results never show.
  const [fetched, setFetched] = useState<{ q: string; titles: string[] }>({ q: "", titles: [] });
  const requestId = useRef(0);

  const current = SCOPES.find((s) => s.value === scope)!;
  const scopeHref = (q: string) => {
    const parts = [current.param, q ? `q=${encodeURIComponent(q)}` : ""].filter(Boolean).join("&");
    return parts ? `${current.path}?${parts}` : current.path;
  };

  const categories = useMemo<Suggestion[]>(
    () =>
      CATEGORIES.map((c) => ({
        key: `c-${c.slug}`,
        label: c.name,
        group: "in Categories",
        href: () => `/marketplace?category=${c.slug}`,
      })),
    [],
  );

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  useEffect(() => {
    const id = ++requestId.current;
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      suggestListings(trimmed)
        .catch(() => [])
        .then((titles) => {
          if (id !== requestId.current) return;
          setFetched({ q: trimmed, titles });
          setActive(-1);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const productTitles = fetched.q === trimmed ? fetched.titles : [];
  const suggestions: Suggestion[] = [
    ...(q.length < 2 ? [] : categories.filter((s) => s.label.toLowerCase().includes(q))),
    ...productTitles.map((title, i) => ({
      key: `p-${i}-${title}`,
      label: title,
      group: "Products",
      href: (h: (q: string) => string) => h(title),
    })),
  ].slice(0, 6);
  const expanded = open && suggestions.length > 0;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    router.push(href);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    go(scopeHref(query.trim()));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const n = suggestions.length;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter" && expanded && active >= 0 && suggestions[active]) {
      e.preventDefault();
      go(suggestions[active].href(scopeHref));
    }
  }

  const label = `Search ${scope}`;

  return (
    <form role="search" onSubmit={onSubmit} className={cn("relative flex flex-col gap-1", className)}>
      <div className="flex gap-3 px-3 text-xs">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={scope === s.value}
            onClick={() => setScope(s.value)}
            className={cn(
              "max-md:min-h-9 border-b-2 px-2 pb-0.5 font-medium",
              scope === s.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center overflow-hidden rounded-full border-2 border-primary focus-within:ring-[3px] focus-within:ring-ring/50">
        <Input
          type="search"
          name="q"
          maxLength={140}
          autoComplete="off"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          aria-label={label}
          placeholder={label}
          className="h-9 flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:ring-0"
        />
        <Button type="submit" className="h-9 rounded-none rounded-r-full px-5">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </div>
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-card py-1 text-sm shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(s.href(scopeHref))}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-4 py-2",
                i === active && "bg-accent",
              )}
            >
              <span className="truncate">{s.label}</span>
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{s.group}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
