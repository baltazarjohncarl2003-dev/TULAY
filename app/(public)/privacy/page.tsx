import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata = { title: "Privacy policy" };

// Privacy notice under the Data Privacy Act of 2012 (RA 10173), its IRR and NPC issuances. Draft: needs legal review.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 9, 2026">
      <p>
        {SITE.name} respects your privacy. This notice explains what personal information we collect, why, how we
        protect it, who we share it with, and the rights you have under the{" "}
        <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>, its Implementing Rules and Regulations, and
        issuances of the National Privacy Commission (NPC).
      </p>

      <h2>1. Who we are</h2>
      <p>
        {SITE.name} is operated by {SITE.legalName} ({SITE.registration}), {SITE.address}. We are the{" "}
        <strong>personal information controller</strong> for the information described here. {SITE.name} is a
        marketplace that connects buyers with suppliers of custom print and packaging. Suppliers make the products;
        PayMongo processes payments; Ninja Van delivers. {SITE.name} never holds buyer money.
      </p>

      <h2>2. Data Protection Officer</h2>
      <p>
        Our Data Protection Officer (DPO) is {SITE.dpoName}. Contact the DPO at {SITE.dpoEmail}, by mail at{" "}
        {SITE.address}, or through our <Link href="/contact?topic=privacy">privacy request form</Link>.
      </p>

      <h2>3. What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> name, email address, mobile number, sign-in records (one-time codes or
          Google sign-in), and your role (buyer or supplier).
        </li>
        <li>
          <strong>Business details:</strong> business name, industry, city, province, website, and delivery addresses.
        </li>
        <li>
          <strong>Supplier verification:</strong> registration documents (DTI/SEC, BIR), government IDs of authorized
          representatives, and payout account details. These are stored in a private storage area that only you and
          our verification staff can open.
        </li>
        <li>
          <strong>Transactions:</strong> requests for quotation, quotes, offers, orders, artwork files, proofs, messages
          with the other party, reviews, returns and disputes.
        </li>
        <li>
          <strong>Payment and delivery records:</strong> payment status and references from PayMongo, and shipment and
          cash-on-delivery status from Ninja Van. We do not see or store your full card number.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, device and browser type, and security logs. We use cookies only
          to keep you signed in and secure; see section 9.
        </li>
      </ul>

      <h2>4. Why we use it, and on what legal basis</h2>
      <ul>
        <li>
          <strong>To provide the marketplace</strong> (accounts, quotes, orders, messages, deliveries, payouts):
          necessary to fulfil our contract with you (Sec. 12(b), RA 10173).
        </li>
        <li>
          <strong>To verify suppliers, prevent fraud and keep the platform secure:</strong> our legitimate interests
          and those of our users (Sec. 12(f)).
        </li>
        <li>
          <strong>To keep tax, accounting and transaction records and respond to authorities:</strong> compliance with
          legal obligations (Sec. 12(c)).
        </li>
        <li>
          <strong>To handle government IDs and other sensitive personal information</strong> for supplier verification:
          your consent and our legal obligations (Sec. 13).
        </li>
        <li>
          <strong>To send marketing messages:</strong> only with your consent, which you can withdraw at any time.
        </li>
      </ul>
      <p>We do not sell your personal information. We do not make decisions about you based solely on automated processing.</p>

      <h2>5. Who we share it with</h2>
      <p>We share only what each party needs:</p>
      <ul>
        <li>
          <strong>The other party in your deal.</strong> A supplier sees the buyer details needed to quote, produce and
          deliver an order. A buyer sees the supplier&apos;s business profile.
        </li>
        <li>
          <strong>Service providers (personal information processors)</strong> bound by data sharing or processing
          agreements: Supabase (database, sign-in and file storage), Vercel (website hosting), PayMongo (payments),
          Ninja Van (delivery and cash on delivery), Resend (account and order emails), Google (optional sign-in) and
          Sentry (error monitoring).
        </li>
        <li>
          <strong>Government authorities</strong> when the law requires it, such as the BIR, courts, or the NPC.
        </li>
      </ul>
      <p>
        Some of these providers store data outside the Philippines. When that happens we require protection
        comparable to the Data Privacy Act, and we remain accountable for your information (Sec. 21, RA 10173).
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep your information while your account is active and for as long as needed for the purposes above. After
        that we keep only what tax, accounting, consumer protection and dispute rules require, and then delete or
        anonymize it. Supplier verification documents are kept while the supplier is active and for the period the law
        requires after closure.
      </p>

      <h2>7. How we protect it</h2>
      <ul>
        <li>Encryption in transit (HTTPS) and at rest.</li>
        <li>Database rules that let each user see only their own records and the other party&apos;s records in a shared deal.</li>
        <li>Multi-factor authentication for staff and for suppliers changing payout accounts.</li>
        <li>Short-lived links for private documents, and an audit log of staff actions.</li>
        <li>Staff access limited by role (verifier, support, finance) and bound by confidentiality.</li>
      </ul>
      <p>
        If a personal data breach puts you at real risk of serious harm, we will notify the NPC and affected users
        within the period the NPC requires (currently 72 hours from knowledge of the breach).
      </p>

      <h2>8. Your rights</h2>
      <p>Under the Data Privacy Act you have the right to:</p>
      <ol>
        <li><strong>Be informed</strong> that your personal information is being processed.</li>
        <li><strong>Access</strong> your personal information and how it is processed.</li>
        <li><strong>Object</strong> to processing, including marketing and profiling.</li>
        <li><strong>Erasure or blocking</strong> of information that is outdated, false, unlawfully obtained or no longer needed.</li>
        <li><strong>Rectification</strong> of inaccurate or incomplete information.</li>
        <li><strong>Data portability</strong>: a copy of your information in a commonly used electronic format.</li>
        <li><strong>Damages</strong> for harm caused by inaccurate, false or unlawfully used information.</li>
        <li><strong>File a complaint</strong> with the National Privacy Commission.</li>
      </ol>
      <p>
        You may also withdraw consent at any time; this does not affect processing already done, or processing we must
        continue by law or contract (for example, records of a paid order).
      </p>
      <p>
        To use any of these rights, send a request through our <Link href="/contact?topic=privacy">privacy request form</Link>{" "}
        or email {SITE.dpoEmail}. We will verify your identity and respond within 15 working days. If you are not
        satisfied, you may contact the National Privacy Commission at{" "}
        <a href="https://privacy.gov.ph" target="_blank" rel="noreferrer">privacy.gov.ph</a>.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use only essential cookies that keep you signed in and protect your session. We do not use advertising
        cookies. If we add analytics later, we will update this notice and ask for your consent where required.
      </p>

      <h2>10. Children</h2>
      <p>
        {SITE.name} is a business marketplace for people 18 years and older. We do not knowingly collect information
        from minors.
      </p>

      <h2>11. Changes to this notice</h2>
      <p>
        We will post changes on this page and update the date above. For significant changes, we will notify you by
        email or in your account before they take effect.
      </p>
    </LegalPage>
  );
}
