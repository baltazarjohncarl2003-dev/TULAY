import Link from "next/link";
import { EmptyState } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
        <EmptyState title="Page not found">
          <p>The page may have moved, or the link is wrong.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/marketplace" className={buttonVariants()}>
              Browse the marketplace
            </Link>
            <Link href="/" className={buttonVariants()}>
              Go home
            </Link>
          </div>
        </EmptyState>
      </main>
      <SiteFooter />
    </>
  );
}
