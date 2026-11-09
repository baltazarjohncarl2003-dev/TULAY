import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Row } from "@/components/common";
import { SITE } from "@/lib/site";
import { ContactForm } from "./contact-form";

export const metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow="We're here to help"
          title="Contact us"
          description="Questions about an order, becoming a supplier, or your personal data. We reply by email within 2 business days."
        />
        <Suspense fallback={null}>
          <ContactForm />
        </Suspense>
      </div>
      <aside className="flex flex-col gap-4 text-sm">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-2 font-semibold">Customer support</h2>
          <Row k="Email" v={SITE.supportEmail} />
          <Row k="Phone" v={SITE.phone} />
          <Row k="Address" v={SITE.address} />
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-2 font-semibold">Data Protection Officer</h2>
          <p className="text-muted-foreground">
            For requests under the Data Privacy Act of 2012 (RA 10173): access, correction, erasure, objection,
            portability, or complaints.
          </p>
          <Row k="DPO" v={SITE.dpoName} />
          <Row k="Email" v={SITE.dpoEmail} />
          <p className="mt-2 text-muted-foreground">
            We respond within 15 working days. You may also contact the{" "}
            <a href="https://privacy.gov.ph" target="_blank" rel="noreferrer" className="text-primary underline">
              National Privacy Commission
            </a>
            . See our <Link href="/privacy" className="text-primary underline">privacy policy</Link>.
          </p>
        </section>
      </aside>
    </main>
  );
}
