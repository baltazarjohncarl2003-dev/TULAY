import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  CalendarCheckIcon,
  CheckIcon,
  InboxIcon,
  PackagePlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  TagIcon,
  UserPlusIcon,
  WalletIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getNumberSettings } from "@/lib/data/settings";
import { php } from "@/lib/format";
import { REQUIRED_DOCUMENTS } from "@/lib/supplier-stats";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";

export const metadata: Metadata = {
  title: "Sell on TULAY",
  description: "Reach business buyers across the Philippines. Apply, get approved, list your products and get paid on TULAY.",
  alternates: { canonical: "/sell" },
  openGraph: {
    title: "Sell on TULAY",
    description: "Reach business buyers across the Philippines. Apply, get approved, list your products and get paid on TULAY.",
    url: "/sell",
  },
};

const SETTING_KEYS = [
  "fee_qrph_bps",
  "fee_card_bps",
  "fee_card_fixed_centavos",
  "fee_ewallet_bps",
  "fee_online_banking_bps",
  "payout_delay_days",
] as const;

const WRAP = "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-12";
const CARD = "flex flex-col gap-2 rounded-lg border bg-card p-5";
const ICON = "flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary";

// Settings are read at request time, so everything that depends on them sits in an async component under Suspense.
export default function SellPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section aria-labelledby="sell-hero" className="bg-accent">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-16">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Sell on TULAY</p>
          <h1 id="sell-hero" className="text-display tracking-tight">
            Reach More Business Buyers Across the Philippines
          </h1>
          <p className="max-w-2xl text-body text-muted-foreground">
            List your products once, receive orders and quote requests from business buyers, and get paid through PayMongo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register?role=supplier" className={buttonVariants({ size: "lg" })}>
              Start Selling
            </Link>
            <Link href="/how-it-works" className={buttonVariants({ size: "lg", variant: "outline" })}>
              How It Works
            </Link>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <SellDetails />
      </Suspense>
    </main>
  );
}

async function SellDetails() {
  const s = await getNumberSettings(SETTING_KEYS);
  const pct = (bps: number) => (bps / 100).toString() + "%";
  const qrphFee = pct(s.fee_qrph_bps);
  const cardFee = `${pct(s.fee_card_bps)} + ${php(s.fee_card_fixed_centavos)}`;
  const ewalletFee = pct(s.fee_ewallet_bps);
  const bankFee = pct(s.fee_online_banking_bps);
  const payoutDays = s.payout_delay_days;

  const STEPS = [
    { title: "Apply", Icon: UserPlusIcon, body: "Create your supplier account and tell us about your business." },
    { title: "Get Approved", Icon: ShieldCheckIcon, body: "Upload your required documents so we can review your account." },
    { title: "List Products", Icon: PackagePlusIcon, body: "Publish products and services with prices, stock and delivery terms." },
    { title: "Receive Orders and Quotes", Icon: InboxIcon, body: "Fill orders and answer requests for quotation from buyers." },
    {
      title: "Get Paid",
      Icon: WalletIcon,
      body: `Payouts are released ${payoutDays} days after delivery, and cash on delivery goes to your own Ninja Van account.`,
    },
  ];

  const BENEFITS = [
    {
      title: "Reach",
      Icon: SearchIcon,
      body: "Buyers search by category, and requests for quotation are matched to your products.",
    },
    {
      title: "Free During Testing",
      Icon: TagIcon,
      body: "No TULAY commission while the platform is in testing. You pay only payment-processor fees.",
    },
    {
      title: "Reliable Payouts",
      Icon: CalendarCheckIcon,
      body: `Payouts are released ${payoutDays} days after delivery and paid through PayMongo.`,
    },
  ];

  const FAQS = [
    {
      q: "How long does verification take?",
      a: "We review applications in the order received and email you if documents are missing. There is no fixed number of days.",
    },
    {
      q: "What does it cost to sell?",
      a: `TULAY charges no commission during testing. You pay only payment-processor fees: QR Ph ${qrphFee}, cards ${cardFee}, e-wallets ${ewalletFee}, and online banking ${bankFee}.`,
    },
    {
      q: "When do I get paid?",
      a: `Payouts are released ${payoutDays} days after delivery. Valid claims raised later are deducted from your next payout.`,
    },
    {
      q: "Can I accept cash on delivery?",
      a: "Yes, through your own Ninja Van account connected to TULAY, so the cash goes to you. Custom-printed items need an online downpayment first.",
    },
    {
      q: "Can I sell custom-printed items?",
      a: "Yes. Custom orders go through artwork, proof, buyer approval, then production. The approved proof is kept as evidence.",
    },
    {
      q: "Can I use one account to buy and sell?",
      a: "Yes. One TULAY account can both buy and sell.",
    },
  ];

  return (
    <>
      <section aria-labelledby="sell-steps" className={WRAP}>
        <h2 id="sell-steps" className="text-heading">How Selling Works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(({ title, Icon, body }, i) => (
            <li key={title} className={CARD}>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className={ICON}>
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-bold text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="text-card-title">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sell-why" className={`${WRAP} bg-muted/40`}>
        <h2 id="sell-why" className="text-heading">Why Sell on TULAY</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {BENEFITS.map(({ title, Icon, body }) => (
            <li key={title} className={CARD}>
              <span aria-hidden="true" className={ICON}>
                <Icon className="size-5" />
              </span>
              <h3 className="text-card-title">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sell-fees" className={WRAP}>
        <h2 id="sell-fees" className="text-heading">Fees</h2>
        <p className="text-sm text-muted-foreground">Payment-processor fees are paid by the supplier.</p>
        <dl className="flex max-w-xl flex-col divide-y rounded-lg border bg-card">
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <dt className="text-sm">QR Ph (any bank or e-wallet app)</dt>
            <dd className="price text-sm">{qrphFee}</dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <dt className="text-sm">Cards</dt>
            <dd className="price text-sm">{cardFee}</dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <dt className="text-sm">E-wallets (GCash, Maya)</dt>
            <dd className="price text-sm">{ewalletFee}</dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <dt className="text-sm">Online banking</dt>
            <dd className="price text-sm">{bankFee}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">TULAY commission: 0% during testing.</p>
      </section>

      <section aria-labelledby="sell-requirements" className={`${WRAP} bg-muted/40`}>
        <h2 id="sell-requirements" className="text-heading">Requirements</h2>
        <p className="text-sm text-muted-foreground">TULAY reviews documents before your listings go live.</p>
        <ul className="flex flex-col gap-2 text-sm">
          {REQUIRED_DOCUMENTS.map((kind) => (
            <li key={kind} className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              {SUPPLIER_DOCUMENT_KINDS[kind]}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sell-faq" className={WRAP}>
        <h2 id="sell-faq" className="text-heading">Frequently Asked Questions</h2>
        <div className="flex flex-col gap-3">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer text-card-title">{q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="sell-cta" className="bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="sell-cta" className="text-heading">Ready to Grow Your Business?</h2>
          <Link href="/register?role=supplier" className={buttonVariants({ size: "lg", variant: "secondary" })}>
            Create a Supplier Account
          </Link>
        </div>
      </section>
    </>
  );
}
