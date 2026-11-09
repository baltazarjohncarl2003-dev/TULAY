import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata = { title: "Terms and conditions" };

// Draft: needs legal review (Consumer Act RA 7394, Internet Transactions Act RA 11967, E-Commerce Act RA 8792).
export default function TermsPage() {
  return (
    <LegalPage title="Terms and conditions" updated="November 9, 2026">
      <p>
        These terms govern your use of {SITE.name}, operated by {SITE.legalName}, {SITE.address}. By creating an
        account or using the site you agree to them. If you use {SITE.name} for a business, you confirm you are
        authorized to bind that business.
      </p>

      <h2>1. What {SITE.name} is</h2>
      <p>
        {SITE.name} is an online marketplace that connects buyers with independent suppliers of custom print and
        packaging. Suppliers make, sell and are responsible for their products. {SITE.name} is not the seller, does not
        manufacture products, and <strong>never holds buyer money</strong>: online payments are processed by PayMongo
        and cash on delivery is collected by Ninja Van for the supplier.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be at least 18 years old and give accurate information.</li>
        <li>Keep your sign-in method secure. You are responsible for activity on your account.</li>
        <li>
          Suppliers must pass our verification review before listing products or receiving requests. Approval is an
          onboarding check, not a guarantee of quality, stock or regulatory compliance.
        </li>
        <li>We may suspend or close accounts that break these terms or the law, with notice where practical.</li>
      </ul>

      <h2>3. Listings, quotes and offers</h2>
      <ul>
        <li>Suppliers set their own prices, minimum order quantities, lead times and return class for each product.</li>
        <li>Prices shown as indicative and quotes are offers from the supplier, not from {SITE.name}.</li>
        <li>
          A negotiated (Tawad) price is locked only for the buyer, product variant, quantity and expiry shown. Minimum
          order quantities always apply.
        </li>
        <li>Requests for quotation are limited per day to prevent abuse.</li>
      </ul>

      <h2>4. Custom orders and artwork</h2>
      <ul>
        <li>
          You confirm that you own or have permission to use any artwork, logo or text you upload, and that it does not
          infringe anyone&apos;s rights or the law.
        </li>
        <li>
          The supplier sends a proof. Before approving, check size, spelling and image quality. The approved proof is
          final and is kept as the record of what was ordered.
        </li>
        <li>Custom orders can be cancelled only until the proof is approved or production starts.</li>
        <li>Items made to your approved proof are not returnable for buyer errors in the design.</li>
      </ul>

      <h2>5. Payments, fees and delivery</h2>
      <ul>
        <li>
          Online payments go through PayMongo on its secure page. Your order is confirmed only when PayMongo confirms
          the payment to us.
        </li>
        <li>
          Cash on delivery is available through Ninja Van, subject to a per-order limit. Custom-printed items need an
          online downpayment before production.
        </li>
        <li>
          Suppliers pay payment processing fees and any {SITE.name} commission, as shown in their account. During the
          testing period {SITE.name} charges no commission. Any change is announced to suppliers in advance and never
          applies to orders already placed.
        </li>
        <li>Delivery times are estimates from the supplier and Ninja Van.</li>
      </ul>

      <h2>6. Returns, refunds and disputes</h2>
      <p>
        Returns and refunds follow our <Link href="/returns">Returns and refunds policy</Link>, which does not limit
        your rights under the Consumer Act of the Philippines (RA 7394) and the Internet Transactions Act (RA 11967).
        Contact the supplier first; if you cannot agree, open a dispute and {SITE.name} will review it.
      </p>

      <h2>7. Prohibited use</h2>
      <ul>
        <li>Counterfeit, illegal or infringing goods or designs.</li>
        <li>Taking a deal or payment off the platform to avoid fees or buyer protections.</li>
        <li>Fake accounts, reviews, quotes or orders; scraping; or attempts to break our security.</li>
        <li>Harassment, spam or misuse of other users&apos; personal information.</li>
      </ul>

      <h2>8. Privacy</h2>
      <p>
        We handle personal information under our <Link href="/privacy">Privacy policy</Link> and the Data Privacy Act
        of 2012 (RA 10173). Information you receive about another user may be used only to complete your deal with
        them.
      </p>

      <h2>9. Liability</h2>
      <p>
        {SITE.name} provides the marketplace as is. To the extent the law allows, {SITE.name} is not liable for the
        products, acts or omissions of suppliers, buyers, PayMongo or Ninja Van, or for indirect or consequential loss.
        Nothing in these terms limits liability that cannot be limited under Philippine law.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these terms. We will post the new version here and, for significant changes, notify you before
        they take effect. Continued use after that means you accept the update.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of the Philippines. Disputes will be brought before the
        proper courts of {SITE.venue}, without prejudice to remedies available before government agencies such as the
        Department of Trade and Industry.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms: {SITE.supportEmail} or our <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
