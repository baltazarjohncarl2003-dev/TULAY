"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Scope = "products" | "suppliers";

const SCOPES: { value: Scope; label: string; path: string }[] = [
  { value: "products", label: "Products", path: "/marketplace" },
  { value: "suppliers", label: "Suppliers", path: "/suppliers" },
];

export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("products");
  const [query, setQuery] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    const path = SCOPES.find((s) => s.value === scope)!.path;
    router.push(q ? `${path}?q=${encodeURIComponent(q)}` : path);
  }

  return (
    <form role="search" onSubmit={onSubmit} className={cn("flex flex-col gap-1", className)}>
      <div className="flex gap-3 px-3 text-xs">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={scope === s.value}
            onClick={() => setScope(s.value)}
            className={cn(
              "border-b-2 pb-0.5 font-medium",
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={scope === "products" ? "Search products" : "Search suppliers"}
          placeholder={scope === "products" ? "Search products" : "Search suppliers"}
          className="h-9 flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:ring-0"
        />
        <Button type="submit" className="h-9 rounded-none rounded-r-full px-5">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </div>
    </form>
  );
}
