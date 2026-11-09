import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_NAV } from "@/components/nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
          TULAY
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {PUBLIC_NAV.map((n) => (
            <Link key={n.href} href={n.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Log in
          </Link>
          <Link href="/login?role=buyer" className={buttonVariants({ size: "sm" })}>
            Get quotes
          </Link>
        </div>
      </div>
      <nav aria-label="Main mobile" className="flex gap-1 overflow-x-auto border-t px-2 py-1 md:hidden">
        {PUBLIC_NAV.map((n) => (
          <Link key={n.href} href={n.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <span>
          <strong className="text-primary">TULAY</strong> · Custom print and packaging, direct from Philippine suppliers.
        </span>
        <span>© 2026 TULAY. TULAY never holds buyer money.</span>
      </div>
    </footer>
  );
}
