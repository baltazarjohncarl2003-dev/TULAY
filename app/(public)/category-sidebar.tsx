import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { liveCategories } from "@/lib/categories";
import { countLiveByCategory } from "@/lib/data/catalog";

const ITEM =
  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted focus-visible:bg-muted";

// No Suspense needed: the home page already awaits the same cached catalog read outside any boundary.
export async function CategorySidebar() {
  const live = liveCategories(await countLiveByCategory());
  const tops = live.filter((c) => c.parentSlug === null);
  return (
    <nav aria-label="Categories" className="relative h-full rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-card-title">Categories</h2>
        <Link href="/categories" className="text-xs font-medium text-primary hover:underline">
          View All
        </Link>
      </div>
      {live.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Categories appear here as suppliers list products.</p>
      ) : (
        <ul className="py-1">
          {tops.map((c) => {
            const children = live.filter((s) => s.parentSlug === c.slug);
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
                            className="block rounded px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
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
      )}
    </nav>
  );
}
