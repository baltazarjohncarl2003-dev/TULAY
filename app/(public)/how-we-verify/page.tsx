import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { REQUIRED_DOCUMENTS } from "@/lib/supplier-stats";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";

export const metadata = {
  title: "How We Verify Suppliers",
  description: "What the Approved supplier badge on TULAY means, the documents we review, and what it does not cover.",
};

// Every statement here must match what the product actually does: keep it in step with REQUIRED_DOCUMENTS,
// admin_set_supplier_status and the listing review. Do not add checks TULAY does not perform.
export default function HowWeVerifyPage() {
  return (
    <LegalPage title="How We Verify Suppliers" updated="November 24, 2026">
      <p>
        An <strong>Approved supplier</strong> badge means a TULAY staff member reviewed the business&apos;s registration
        documents and approved it to sell on TULAY. It tells you the business is registered. It is not a guarantee of
        product quality.
      </p>

      <h2>What we check</h2>
      <p>Before a business can be approved, it uploads these documents:</p>
      <ul>
        {REQUIRED_DOCUMENTS.map((kind) => (
          <li key={kind}>{SUPPLIER_DOCUMENT_KINDS[kind]}</li>
        ))}
      </ul>
      <p>
        A member of TULAY&apos;s verification team reviews the documents and the business profile (name, location and
        what it sells), then approves or rejects the application. The documents stay private: only the business and
        TULAY&apos;s verification team can open them.
      </p>
      <p>Every product listing is also reviewed by TULAY before it appears on the marketplace.</p>

      <h2>What the badge does not mean</h2>
      <ul>
        <li>We do not inspect products, factories or warehouses, and we do not place sample orders.</li>
        <li>Years in business are reported by the supplier. We label them &quot;self-reported&quot;.</li>
        <li>Prices on listings are indicative. The final price is in the supplier&apos;s quotation or at checkout.</li>
      </ul>

      <h2>After approval</h2>
      <ul>
        <li>TULAY can restrict or suspend a supplier&apos;s account.</li>
        <li>Only buyers whose order was delivered can leave a review, once per order.</li>
      </ul>

      <h2>If something goes wrong</h2>
      <p>
        Report a problem from the order in your account. The supplier answers first, and TULAY steps in if you cannot
        agree. See <Link href="/returns">Returns and Refunds</Link> for report windows, or{" "}
        <Link href="/contact?topic=order">contact us</Link>.
      </p>
    </LegalPage>
  );
}
