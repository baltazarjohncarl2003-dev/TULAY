import {
  FileTextIcon,
  HomeIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { HeaderSearch } from "@/components/header-search";
import { MegaMenu } from "@/components/mega-menu";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_NAV } from "@/components/nav";
import { SITE } from "@/lib/site";

const UTILITY_LINKS = [
  { href: "/login?role=supplier", label: "Sell on TULAY" },
  { href: "/contact", label: "Help center" },
  { href: "/login", label: "Sign in" },
  { href: "/login?role=buyer", label: "Create account" },
];

const ICON_LINKS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/buyer/messages", label: "Messages", Icon: MessageSquareIcon },
  { href: "/buyer", label: "Account", Icon: UserIcon },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="hidden h-8 bg-ink text-xs text-ink-foreground md:block">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4">
          <span className="whitespace-nowrap">The bridge to better business.</span>
          <nav aria-label="Utility" className="flex items-center gap-4">
            {UTILITY_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap opacity-80 hover:opacity-100">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
          TULAY
        </Link>
        <HeaderSearch className="hidden w-full max-w-3xl flex-1 md:flex" />
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          {ICON_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="hidden flex-col items-center gap-0.5 text-[11px] leading-none text-muted-foreground hover:text-foreground md:flex"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <Link href="/buyer/rfqs/new" className={buttonVariants({ size: "sm" }) + " whitespace-nowrap"}>
            Request a quote
          </Link>
        </div>
      </div>
      <div className="px-4 pb-2 md:hidden">
        <HeaderSearch className="w-full" />
      </div>
      <div className="hidden h-11 border-t md:block">
        <div className="relative mx-auto flex h-full w-full max-w-6xl items-center gap-6 px-4">
          <MegaMenu />
          <nav aria-label="Main" className="flex items-center gap-6">
            {PUBLIC_NAV.map((n) => (
              <Link key={n.label} href={n.href} className="whitespace-nowrap text-sm font-medium hover:text-primary">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

const MOBILE_NAV: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/categories", label: "Categories", Icon: LayoutGridIcon },
  { href: "/buyer/rfqs/new", label: "Request quote", Icon: FileTextIcon },
  { href: "/buyer/messages", label: "Messages", Icon: MessageSquareIcon },
  { href: "/buyer", label: "Account", Icon: UserIcon },
];

export function MobileBottomNav() {
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 h-16 border-t bg-background md:hidden">
      <ul className="grid h-full grid-cols-5">
        {MOBILE_NAV.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full flex-col items-center justify-center gap-1 text-[10px] leading-none text-muted-foreground hover:text-foreground"
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "For buyers",
    links: [
      { href: "/marketplace", label: "Explore products" },
      { href: "/suppliers", label: "Find suppliers" },
      { href: "/categories", label: "Browse categories" },
      { href: "/buyer/rfqs/new", label: "Request a quote" },
    ],
  },
  {
    heading: "For suppliers",
    links: [
      { href: "/login?role=supplier", label: "Sell on TULAY" },
      { href: "/login?role=supplier", label: "Supplier sign in" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/how-it-works", label: "How it works" },
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
    <footer className="mt-auto bg-ink pb-16 text-ink-foreground md:pb-0">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-2 text-sm">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
            TULAY
          </Link>
          <p>The bridge to better business.</p>
          <p className="opacity-70">
            Payments by PayMongo. Deliveries by Ninja Van. TULAY never holds buyer money.
          </p>
        </div>
        {FOOTER_LINKS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-2 text-sm">
            <h2 className="font-semibold">{col.heading}</h2>
            {col.links.map((l) => (
              <Link key={l.label} href={l.href} className="opacity-70 hover:opacity-100">
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs opacity-70 sm:flex-row sm:justify-between">
          <span>© 2026 {SITE.legalName}. All rights reserved.</span>
          <span>
            We process personal data under the Data Privacy Act of 2012 (RA 10173). DPO: {SITE.dpoEmail}
          </span>
        </div>
      </div>
    </footer>
  );
}
