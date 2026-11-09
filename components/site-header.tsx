import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_NAV } from "@/components/nav";
import { SITE } from "@/lib/site";

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

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Marketplace",
    links: [
      { href: "/marketplace", label: "Explore products" },
      { href: "/search", label: "Smart sourcing" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    heading: "For business",
    links: [
      { href: "/buyer/rfqs/new", label: "Request a quote" },
      { href: "/login?role=supplier", label: "Become a supplier" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/contact", label: "Contact us" },
      { href: "/returns", label: "Returns and refunds" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms and conditions" },
      { href: "/contact?topic=privacy", label: "Data privacy requests" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
            TULAY
          </Link>
          <p>Custom print and packaging, direct from Philippine suppliers.</p>
          <p>Payments by PayMongo. Deliveries by Ninja Van. TULAY never holds buyer money.</p>
        </div>
        {FOOTER_LINKS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-2 text-sm">
            <h2 className="font-semibold">{col.heading}</h2>
            {col.links.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>© 2026 {SITE.legalName}. All rights reserved.</span>
          <span>
            We process personal data under the Data Privacy Act of 2012 (RA 10173). DPO: {SITE.dpoEmail}
          </span>
        </div>
      </div>
    </footer>
  );
}
