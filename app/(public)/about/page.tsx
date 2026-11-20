import Link from "next/link";
import { PageHeader } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "About Us" };

const LAUNCH_FOCUS = ["Custom shirts", "DTF", "Sublimation", "Packaging", "Customized mugs", "Customized IDs"];

const HOW_IT_WORKS = [
  "Suppliers sell.",
  "TULAY connects them with buyers.",
  "Ninja Van delivers.",
  "PayMongo processes payments.",
  "TULAY never holds buyer money.",
];

const CARD = "flex flex-col gap-3 rounded-lg border bg-card p-6";

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
      <PageHeader
        eyebrow="About TULAY · Philippine B2B marketplace"
        title="About TULAY"
        description="TULAY is a Philippine B2B marketplace connecting buyers with suppliers, manufacturers, wholesalers, distributors and service providers."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="about-launch-title" className={CARD}>
          <h2 id="about-launch-title" className="text-heading">
            Launch focus
          </h2>
          <p className="text-sm text-muted-foreground">
            Custom print and packaging is where TULAY starts.
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {LAUNCH_FOCUS.map((item) => (
              <li key={item} className="rounded-md border bg-background px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-how-title" className={CARD}>
          <h2 id="about-how-title" className="text-heading">
            How it works
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {HOW_IT_WORKS.map((line) => (
              <li key={line} className="rounded-md border bg-background px-3 py-2">
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/marketplace" className={buttonVariants()}>
          Browse products
        </Link>
        <Link href="/sell" className={buttonVariants({ variant: "outline" })}>
          Sell on TULAY
        </Link>
        <Link href="/contact" className={buttonVariants({ variant: "outline" })}>
          Contact us
        </Link>
      </div>
    </main>
  );
}
