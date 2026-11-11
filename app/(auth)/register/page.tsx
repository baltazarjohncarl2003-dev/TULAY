import Link from "next/link";
import { Suspense } from "react";
import { ShoppingBagIcon, StoreIcon } from "lucide-react";
import { Notice } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";

export const metadata = { title: "Create account" };

const DOCS = ["dti_sec", "mayors_permit", "bir", "valid_id"] as const;

type Search = { searchParams: Promise<{ role?: string }> };

// Reading searchParams is request-time data, so it renders inside Suspense (cacheComponents).
export default function RegisterPage({ searchParams }: Search) {
  return (
    <Suspense fallback={null}>
      <RegisterOptions searchParams={searchParams} />
    </Suspense>
  );
}

async function RegisterOptions({ searchParams }: Search) {
  const { role } = await searchParams;
  const supplierFirst = role === "supplier";

  const buyer = (
    <OptionCard key="buyer" active={role === "buyer"} Icon={ShoppingBagIcon} title="Buyer" blurb="Find products, compare supplier quotes and manage requests.">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Post requests for quotation</li>
        <li>Compare quotes side by side</li>
        <li>Message suppliers</li>
      </ul>
      <Link href="/login?role=buyer" className={cn(buttonVariants(), "mt-auto")}>
        Create buyer account
      </Link>
    </OptionCard>
  );
  const supplier = (
    <OptionCard key="supplier" active={supplierFirst} Icon={StoreIcon} title="Supplier" blurb="List your products and services and receive matched buyer requests.">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Free during testing</li>
        <li>Reviewed before going live</li>
      </ul>
      <div className="text-sm">
        <p className="font-medium">Documents you&apos;ll need:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          {DOCS.map((k) => (
            <li key={k}>{SUPPLIER_DOCUMENT_KINDS[k]}</li>
          ))}
        </ul>
      </div>
      <Link href="/login?role=supplier" className={cn(buttonVariants(), "mt-auto")}>
        Create supplier account
      </Link>
    </OptionCard>
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:py-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Join TULAY</h1>
        <p className="mt-1 text-muted-foreground">
          The bridge to better business. Choose how you&apos;ll use TULAY. You can browse without an account.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{supplierFirst ? [supplier, buyer] : [buyer, supplier]}</div>
      <p className="text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <Notice>One account has one role for now. Want to buy and sell? Use a separate email for each.</Notice>
    </main>
  );
}

function OptionCard({
  active,
  Icon,
  title,
  blurb,
  children,
}: {
  active: boolean;
  Icon: typeof StoreIcon;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Card className={cn("h-full", active && "ring-2 ring-primary")}>
        <CardContent className="flex h-full flex-col gap-4">
          <Icon className="size-8 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm">{blurb}</p>
          {children}
        </CardContent>
      </Card>
    </section>
  );
}
