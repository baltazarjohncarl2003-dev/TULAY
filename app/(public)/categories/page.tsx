import Link from "next/link";
import { CATEGORIES, LAUNCH_CATEGORIES, publicProducts } from "@/lib/demo/data";
import { CategoryIcon } from "@/components/category-icon";
import { qty } from "@/lib/format";

export const metadata = { title: "All categories" };

/** Public listings whose category is one of `slugs`. */
function countIn(categorySlugs: string[], slugs: Set<string>): number {
  return categorySlugs.filter((s) => slugs.has(s)).length;
}

export default function CategoriesPage() {
  const productSlugs = publicProducts().map((p) => p.categorySlug);
  const childrenOf = (slug: string) => CATEGORIES.filter((c) => c.parentSlug === slug);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span>All categories</span>
      </nav>
      <h1 className="text-xl font-bold">All categories</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse products, suppliers and services by category.</p>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LAUNCH_CATEGORIES.map((c) => (
          <li key={c.slug}>
            <a href={`#${c.slug}`} className="text-primary hover:underline">
              {c.name}
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LAUNCH_CATEGORIES.map((top) => {
          const children = childrenOf(top.slug);
          const total = countIn(productSlugs, new Set([top.slug, ...children.map((c) => c.slug)]));
          return (
            <section key={top.slug} id={top.slug} className="scroll-mt-32 rounded-lg border bg-card p-4">
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
                    <span className="text-muted-foreground">({qty(countIn(productSlugs, new Set([c.slug])))})</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
