import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Status tabs plus a search box as plain links and a GET form (no JavaScript needed). "" is the default tab. */
export function StatusTabs({
  tabs,
  status,
  q,
  placeholder,
}: {
  tabs: { value: string; label: string }[];
  status: string;
  q: string;
  placeholder: string;
}) {
  const href = (value: string, withQ = true) => {
    const sp = new URLSearchParams();
    if (value) sp.set("status", value);
    if (q && withQ) sp.set("q", q);
    return `?${sp.toString()}`;
  };
  return (
    <div className="mb-4 flex flex-col gap-3">
      <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={href(t.value)}
            aria-current={t.value === status ? "page" : undefined}
            className={cn(buttonVariants({ variant: t.value === status ? "default" : "outline", size: "sm" }))}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        {status && <input type="hidden" name="status" value={status} />}
        <Input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} maxLength={80} className="sm:max-w-sm" />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {q && (
          <Link href={href(status, false)} className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        )}
      </form>
    </div>
  );
}
