import { MessageSquareIcon, ShoppingCartIcon, UserIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderSearch } from "@/components/header-search";
import { MegaMenu } from "@/components/mega-menu";
import { BottomNavLinks, MainNavLinks, MobileMenu, type BottomTab, type NavLink } from "@/components/mobile-menu";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_NAV } from "@/components/nav";
import { getSessionUser, homeFor, type SessionUser } from "@/lib/auth";
import { getCart } from "@/lib/data/orders";
import { isSet, setOr, SITE } from "@/lib/site";

const UTILITY_LINKS: NavLink[] = [
  { href: "/buyers", label: "For Buyers" },
  { href: "/sell", label: "Sell on TULAY" },
  { href: "/contact", label: "Contact Us" },
];

/** Signed out: Sign in / Create account, and /login for Messages and Account. Signed in: role hub links. */
function accountFor(user: SessionUser | null) {
  if (!user) {
    return {
      messages: "/login",
      account: "/login",
      utility: [
        { href: "/login", label: "Sign in" },
        { href: "/register", label: "Create Account" },
      ],
    };
  }
  const messages = `/${user.role}/messages`;
  const account = homeFor(user.role);
  return {
    messages,
    account,
    utility: [
      { href: messages, label: "Messages" },
      { href: account, label: "Account" },
    ],
  };
}

const SIGNED_OUT = accountFor(null);

const ICON_LINKS: { key: "messages" | "account"; label: string; Icon: LucideIcon }[] = [
  { key: "messages", label: "Messages", Icon: MessageSquareIcon },
  { key: "account", label: "Account", Icon: UserIcon },
];

function utilityItems(links: NavLink[]) {
  return links.map((l) => (
    <Link key={l.label} href={l.href} className="whitespace-nowrap opacity-80 hover:opacity-100">
      {l.label}
    </Link>
  ));
}

function iconItems(account: ReturnType<typeof accountFor>) {
  return ICON_LINKS.map(({ key, label, Icon }) => (
    <Link
      key={key}
      href={account[key]}
      className="hidden flex-col items-center gap-0.5 text-micro leading-none text-muted-foreground hover:text-foreground md:flex"
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </Link>
  ));
}

function bottomTabs(account: ReturnType<typeof accountFor>): BottomTab[] {
  return [
    { key: "home", label: "Home", href: "/" },
    { key: "categories", label: "Categories", href: "/categories" },
    { key: "request", label: "Request Quote", href: "/buyer/rfqs/new" },
    { key: "messages", label: "Messages", href: account.messages },
    { key: "account", label: "Account", href: account.account },
  ];
}

/** Signed out: Sign in and Create account beside the Account icon. Signed in: nothing, the icons cover it. */
function authButtons(user: SessionUser | null) {
  if (user) return null;
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" }) + " whitespace-nowrap"}>
        Sign in
      </Link>
      <Link href="/register" className={buttonVariants({ size: "sm" }) + " whitespace-nowrap"}>
        Create Account
      </Link>
    </div>
  );
}

async function SessionAuthButtons() {
  return authButtons(await getSessionUser());
}

/** Cart link with a line count, for signed-in buyers (shown on mobile too: the bottom bar has no spare tab). */
async function CartLink() {
  const lines = (await getCart()).length;
  return (
    <Link
      href="/buyer/cart"
      aria-label={lines > 0 ? `Cart, ${lines} ${lines === 1 ? "line" : "lines"}` : "Cart"}
      className="relative flex flex-col items-center gap-0.5 text-micro leading-none text-muted-foreground hover:text-foreground"
    >
      <ShoppingCartIcon className="size-5" aria-hidden="true" />
      <span className="hidden md:inline">Cart</span>
      {lines > 0 && (
        <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-primary px-1 py-0.5 text-center text-micro font-semibold text-primary-foreground">
          {lines}
        </span>
      )}
    </Link>
  );
}

/** Messages and Account icons are for signed-in users only; signed-out visitors get Sign in / Create account. */
async function SessionIcons() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <>
      {/* One account buys and sells: every non-admin account has a cart. */}
      {user.role !== "admin" && <CartLink />}
      {iconItems(accountFor(user))}
    </>
  );
}

async function SessionMenu() {
  const account = accountFor(await getSessionUser());
  return <MobileMenu navItems={PUBLIC_NAV} utilityLinks={[...UTILITY_LINKS, ...account.utility]} />;
}

async function SessionBottomTabs() {
  return <BottomNavLinks items={bottomTabs(accountFor(await getSessionUser()))} />;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="hidden h-9 bg-ink text-meta text-ink-foreground md:block">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4">
          <span className="whitespace-nowrap">The bridge to better business.</span>
          <nav aria-label="Utility" className="flex items-center gap-4">
            {utilityItems(UTILITY_LINKS)}
            <Link href="/buyer/rfqs/new" className="whitespace-nowrap font-semibold hover:underline">
              Request a Quote
            </Link>
          </nav>
        </div>
      </div>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 md:h-20">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-primary md:text-2xl">
          TULAY
        </Link>
        <HeaderSearch className="hidden w-full max-w-3xl flex-1 md:flex" />
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <Suspense
            fallback={<MobileMenu navItems={PUBLIC_NAV} utilityLinks={[...UTILITY_LINKS, ...SIGNED_OUT.utility]} />}
          >
            <SessionMenu />
          </Suspense>
          <Suspense fallback={null}>
            <SessionIcons />
          </Suspense>
          <Suspense fallback={authButtons(null)}>
            <SessionAuthButtons />
          </Suspense>
        </div>
      </div>
      <div className="px-4 pb-2 md:hidden">
        <HeaderSearch className="w-full" />
      </div>
      <div className="hidden h-12 border-t md:block">
        <div className="relative mx-auto flex h-full w-full max-w-7xl items-center gap-6 px-4">
          <MegaMenu />
          <nav aria-label="Main" className="flex items-center gap-6">
            <MainNavLinks items={PUBLIC_NAV} />
          </nav>
        </div>
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 h-16 border-t bg-background md:hidden">
      <Suspense fallback={<BottomNavLinks items={bottomTabs(SIGNED_OUT)} />}>
        <SessionBottomTabs />
      </Suspense>
    </nav>
  );
}

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "For Buyers",
    links: [
      { href: "/buyers", label: "Why Buy on TULAY" },
      { href: "/marketplace", label: "Explore Products" },
      { href: "/suppliers", label: "Find Suppliers" },
      { href: "/categories", label: "Browse Categories" },
      { href: "/buyer/rfqs/new", label: "Request a Quote" },
    ],
  },
  {
    heading: "For Suppliers",
    links: [
      { href: "/sell", label: "Sell on TULAY" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/how-it-works", label: "How It Works" },
      { href: "/contact", label: "Contact Us" },
      { href: "/returns", label: "Returns and Refunds" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms and Conditions" },
      { href: "/contact?topic=privacy", label: "Data Privacy Requests" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink pb-16 text-ink-foreground md:pb-0">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
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
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-4 text-xs opacity-70 sm:flex-row sm:justify-between">
          <span>© 2026 {setOr(SITE.legalName, SITE.name)}. All rights reserved.</span>
          <span>
            We process personal data under the Data Privacy Act of 2012 (RA 10173).
            {isSet(SITE.dpoEmail) && ` DPO: ${SITE.dpoEmail}`}
          </span>
        </div>
      </div>
    </footer>
  );
}
