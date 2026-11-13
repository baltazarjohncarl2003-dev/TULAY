import Link from "next/link";
import { Suspense } from "react";
import { getNumberSettings } from "@/lib/data/settings";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Returns and refunds" };

const WINDOWS = ["report_window_damage_days", "report_window_return_days", "report_window_defect_days"] as const;

// Windows are admin settings read at request time; final values await legal review per CLAUDE.md open items.
export default function ReturnsPage() {
  return (
    <Suspense fallback={null}>
      <Returns />
    </Suspense>
  );
}

async function Returns() {
  const w = await getNumberSettings(WINDOWS);
  return (
    <LegalPage title="Returns and refunds" updated="November 9, 2026">
      <p>
        Every product on TULAY is tagged <strong>standard</strong>, <strong>custom</strong> or{" "}
        <strong>final sale</strong>, and the tag is shown on the product page and at checkout. The supplier handles your
        request first; TULAY steps in if you cannot agree.
      </p>

      <h2>Report windows</h2>
      <p>Counted from the delivery date recorded by Ninja Van:</p>
      <ul>
        <li><strong>{w.report_window_damage_days} days</strong> for items damaged in transit, wrong items, or missing items.</li>
        <li><strong>{w.report_window_return_days} days</strong> for change-of-mind returns on standard items.</li>
        <li><strong>{w.report_window_defect_days} days</strong> for print defects such as peeling, cracking or fading.</li>
      </ul>

      <h2>By product type</h2>
      <h3>Standard items</h3>
      <p>
        Returnable within {w.report_window_return_days} days if unused and in original condition. If the supplier made a mistake, the supplier
        pays return shipping; for change of mind, you do. A supplier may charge a restocking fee only if it was shown on
        the product page before you ordered.
      </p>
      <h3>Custom items</h3>
      <p>
        You can cancel until you approve the proof or the supplier starts production. After that, custom items cannot
        be returned for buyer errors (wrong size, spelling or low-resolution artwork you approved). If the item is
        damaged, defective or does not match the approved proof, the supplier will replace it or refund you.
      </p>
      <h3>Final sale items</h3>
      <p>Not returnable, except where the law gives you a remedy for defective goods.</p>

      <h2>How to ask for a return or refund</h2>
      <ol>
        <li>Open the order in your account and choose Report a problem.</li>
        <li>Add at least one photo or video and describe the issue.</li>
        <li>If approved, you receive a Return Authorization number and the return address. Do not ship before that.</li>
        <li>If the supplier declines and you disagree, open a dispute and TULAY will decide.</li>
      </ol>

      <h2>Refunds</h2>
      <ul>
        <li>Card and e-wallet payments are refunded to the original payment method through PayMongo.</li>
        <li>Cash-on-delivery orders are refunded to the GCash, Maya or bank account you provide.</li>
        <li>Refunds never exceed what you paid for the item.</li>
      </ul>

      <h2>Your legal rights</h2>
      <p>
        This policy does not limit your rights under the Consumer Act of the Philippines (RA 7394) and the Internet
        Transactions Act (RA 11967). Questions? <Link href="/contact?topic=order">Contact us</Link>.
      </p>
    </LegalPage>
  );
}
