import Link from "next/link";
import { PageHeader, Notice } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "How it works" };

const STEPS = [
  { title: "Explore possibilities", body: "Browse published products from approved suppliers." },
  { title: "Describe the details", body: "Submit quantities, specifications, dates and delivery location." },
  { title: "Get matched", body: "Eligible, approved and opted-in suppliers receive invitations." },
  { title: "Compare & negotiate", body: "Review actual quotations, transparent known costs and commercial terms." },
  { title: "Select your supplier", body: "Record your chosen quotation. Payment and fulfillment are handled separately." },
  { title: "Build lasting relationships", body: "Continue your sourcing conversations on the platform." },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
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
          TULAY is a sourcing and quotation platform. TULAY never holds buyer money; payments go through PayMongo and
          Ninja Van. Supplier approval does not guarantee performance, stock, or regulatory certification.
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
