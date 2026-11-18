import Link from "next/link";
import { HouseIcon, ShoppingCartIcon, SparklesIcon, StoreIcon, UserRoundIcon } from "lucide-react";

// Plain links with a visible focus ring; labels hide below sm, so each link keeps an aria-label.
const link =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

const NAV = [
  { href: "/", label: "Home", Icon: HouseIcon },
  { href: "/marketplace", label: "Marketplace", Icon: StoreIcon },
  { href: "/buyer/cart", label: "Cart", Icon: ShoppingCartIcon },
  { href: "/buyer", label: "Account", Icon: UserRoundIcon },
];

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="sticky top-0 z-40 h-14 border-b bg-background/95 backdrop-blur">
        <div className="flex h-full items-center gap-3 px-4">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
            TULAY
          </Link>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <SparklesIcon aria-hidden="true" className="size-4" /> AI Mode
          </span>
          <nav aria-label="AI Mode navigation" className="ml-auto flex items-center gap-1">
            {NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} aria-label={label} className={link}>
                <Icon aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
