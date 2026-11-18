import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState, PageHeader } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { liveCategories } from "@/lib/categories";
import { countLiveByCategory } from "@/lib/data/catalog";
import { qty } from "@/lib/format";

export const metadata = { title: "All Categories" };

export default async function CategoriesPage() {
  const counts = await countLiveByCategory();
  const live = liveCategories(counts);
  const tops = live.filter((c) => c.parentSlug === null);
  const childrenOf = (slug: string) => live.filter((c) => c.parentSlug === slug);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span>All categories</span>
      </nav>
      <PageHeader title="All Categories" description="Browse products, suppliers and services by category." />

      {tops.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No categories yet. Suppliers are adding products.">
            <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
              Browse the marketplace
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {tops.map((c) => (
              <li key={c.slug}>
                <a href={`#${c.slug}`} className="text-primary hover:underline">
                  {c.name}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tops.map((top) => {
              const children = childrenOf(top.slug);
              const total = (counts[top.slug] ?? 0) + children.reduce((n, c) => n + (counts[c.slug] ?? 0), 0);
              return (
                <section key={top.slug} id={top.slug} className="scroll-mt-[var(--header-h)] rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                      <CategoryIcon slug={top.slug} className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <Link href={`/marketplace?category=${top.slug}`} className="font-semibold hover:underline">
                        {top.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{qty(total)} listing{total === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {children.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/marketplace?category=${c.slug}`} className="hover:underline">
                          {c.name}
                        </Link>{" "}
                        <span className="text-muted-foreground">({qty(counts[c.slug] ?? 0)})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
