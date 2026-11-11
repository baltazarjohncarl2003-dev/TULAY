import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORIES, LAUNCH_CATEGORIES } from "@/lib/demo/data";

const ITEM =
  "flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted";

export function CategorySidebar() {
  return (
    <nav aria-label="Categories" className="relative h-full rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-semibold">Categories</h2>
        <Link href="/categories" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      <ul className="py-1">
        {LAUNCH_CATEGORIES.map((c) => {
          const children = CATEGORIES.filter((s) => s.parentSlug === c.slug);
          return (
            <li key={c.slug} className="group">
              <Link href={`/marketplace?category=${c.slug}`} className={ITEM}>
                <CategoryIcon slug={c.slug} className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {children.length > 0 && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </Link>
              {children.length > 0 && (
                <div className="absolute top-0 left-full z-30 hidden h-full min-h-full w-[min(32rem,calc(100vw-20rem))] rounded-lg border bg-card p-4 shadow-lg group-focus-within:block group-hover:block">
                  <p className="mb-2 text-sm font-semibold">{c.name}</p>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {children.map((s) => (
                      <li key={s.slug}>
                        <Link
                          href={`/marketplace?category=${s.slug}`}
                          className="block rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
