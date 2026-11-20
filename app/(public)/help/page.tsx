import {
  CreditCardIcon,
  FileTextIcon,
  PackageIcon,
  RotateCcwIcon,
  RouteIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Help Centre" };

const TOPICS: { href: string; title: string; Icon: LucideIcon; body?: string }[] = [
  { href: "/how-it-works", title: "How TULAY works", Icon: RouteIcon },
  { href: "/buyer/rfqs/new", title: "Post a request for quotation", Icon: FileTextIcon },
  { href: "/buyer/orders", title: "Orders and tracking", Icon: PackageIcon },
  { href: "/returns", title: "Returns and refunds", Icon: RotateCcwIcon },
  {
    href: "/how-it-works",
    title: "Payment methods",
    Icon: CreditCardIcon,
    body: "QR Ph is the default; cards, GCash/Maya e-wallets and online banking are also accepted, processed by PayMongo.",
  },
  { href: "/sell", title: "Selling on TULAY", Icon: StoreIcon },
  { href: "/privacy", title: "Privacy and your data", Icon: ShieldCheckIcon },
  { href: "/terms", title: "Terms and conditions", Icon: ScrollTextIcon },
];

export default function HelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
      <PageHeader
        eyebrow="Help Centre"
        title="How can we help?"
        description="Find answers about sourcing, orders, payments, returns and selling on TULAY."
      />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOPICS.map(({ href, title, Icon, body }) => (
          <li key={title}>
            <Link
              href={href}
              className="flex h-full flex-col gap-3 rounded-lg border bg-card p-5 transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-card-title">{title}</span>
              {body && <span className="text-sm text-muted-foreground">{body}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="help-still-need-title" className="mt-8 flex flex-col gap-3 rounded-lg border bg-card p-6">
        <h2 id="help-still-need-title" className="text-heading">
          Still need help?
        </h2>
        <p className="text-sm text-muted-foreground">Send us a message through our contact page.</p>
        <div>
          <Link href="/contact" className={buttonVariants()}>
            Contact us
          </Link>
        </div>
      </section>
    </main>
  );
}
