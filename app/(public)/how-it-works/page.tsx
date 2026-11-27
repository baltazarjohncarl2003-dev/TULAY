import Link from "next/link";
import { PageHeader, Notice } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "How It Works" };

const STEPS = [
  { title: "Explore possibilities", body: "Browse published products from approved suppliers." },
  { title: "Describe the details", body: "Submit quantities, specifications, dates and delivery location." },
  { title: "Get matched", body: "Eligible, approved and opted-in suppliers receive invitations." },
  { title: "Compare & negotiate", body: "Review actual quotations, transparent known costs and commercial terms." },
  { title: "Select your supplier", body: "Accept a quote, or add ready-made products to your cart and check out. Pay online through PayMongo." },
  { title: "Receive and review", body: "Lalamove delivers. If something is wrong, report it within the return window of the item and TULAY reviews the claim." },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
      <PageHeader
        eyebrow="The TULAY advantage · Philippine B2B marketplace"
        title={
          <>
            Sourcing, without <span className="text-primary">the unnecessary hassle.</span>
          </>
        }
        description="Built for entrepreneurs who'd rather grow their business than chase suppliers through endless messages."
      />

      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
            <span className="text-3xl font-bold text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <Notice tone="warn">
          TULAY connects buyers and suppliers. TULAY never holds buyer money: online payments are processed by PayMongo,
          and buyers pay online for now. Custom-made items need an online downpayment
          first. Returns follow the <Link href="/returns" className="underline">returns policy</Link>. Supplier approval does not guarantee performance, stock, or regulatory certification.
        </Notice>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/marketplace" className={buttonVariants()}>
          Explore products
        </Link>
        <Link href="/register?role=supplier" className={buttonVariants({ variant: "outline" })}>
          Become a supplier
        </Link>
      </div>
    </main>
  );
}
