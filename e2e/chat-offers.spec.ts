import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./auth";

// Master prompt acceptance tests 3 and 4, through the UI with two accounts: buyer offers PHP 120 x 50, supplier
// counters PHP 135, buyer counters PHP 125 + PHP 250 delivery at 50% down, supplier accepts. Total PHP 6,500,
// downpayment PHP 3,250, balance PHP 3,250. Seed: buyer3 (Carlo Mendoza) and Kahon Packaging Co. (supplier2).
// Needs a fresh `supabase db reset`: it expects their chat to start empty (revisions 1 to 3).
const SUPPLIER = "b1000000-0000-4000-8000-000000000002";

test.describe.configure({ timeout: 180_000 });
test.use({ navigationTimeout: 60_000 });
test.skip(({ isMobile }) => isMobile, "One run is enough; the phone layout is covered by the screenshot tests.");

const offerForm = (page: Page) => page.locator("form", { has: page.getByRole("heading", { name: /Set an offer|Counter offer/ }) });
const openCard = (page: Page) => page.getByRole("article", { name: "Offer" }).filter({ hasText: "Waiting for reply" });

test("buyer and supplier negotiate to an accepted offer", async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  await signIn(buyer, "buyer3@tulay.test");
  await buyer.goto(`/buyer/messages?supplier=${SUPPLIER}`);
  await buyer.getByRole("textbox", { name: "Message" }).fill("Hello, we need printed shirts.");
  await buyer.getByRole("button", { name: "Send message" }).click();
  await expect(buyer.getByText("Hello, we need printed shirts.", { exact: true })).toBeVisible();

  // 1. Buyer offers PHP 120 x 50.
  await buyer.getByRole("button", { name: "Set an offer" }).click();
  let form = offerForm(buyer);
  await form.getByLabel("Product", { exact: true }).fill("Printed Shirt");
  await form.getByLabel("Price per unit (₱)").fill("120");
  await form.getByLabel("Quantity").fill("50");
  await form.getByLabel("Lead time (days)").fill("7");
  await form.getByLabel("Downpayment (%)").fill("50");
  await form.getByRole("button", { name: "Send offer" }).click();
  await expect(openCard(buyer)).toContainText("Your offer");
  await expect(openCard(buyer)).toContainText("₱6,000.00");

  // 2. Supplier counters at PHP 135.
  const supplier = await (await browser.newContext()).newPage();
  await signIn(supplier, "supplier2@tulay.test");
  await supplier.goto("/supplier/messages");
  await supplier.getByRole("button", { name: /Carlo Mendoza/ }).first().click();
  await openCard(supplier).getByRole("button", { name: "Counter offer" }).click();
  form = offerForm(supplier);
  await form.getByLabel("Price per unit (₱)").fill("135");
  await form.getByRole("button", { name: "Send offer" }).click();
  await expect(openCard(supplier)).toContainText("Your counteroffer");

  // 3. Buyer counters at PHP 125 with a PHP 250 delivery fee (arrives live; no reload).
  await expect(openCard(buyer)).toContainText("Supplier's counteroffer", { timeout: 10_000 });
  await openCard(buyer).getByRole("button", { name: "Counter offer" }).click();
  form = offerForm(buyer);
  await form.getByLabel("Price per unit (₱)").fill("125");
  await form.getByLabel("Shipping / delivery fee (₱)").fill("250");
  await expect(form).toContainText("₱6,500.00"); // live preview
  await form.getByRole("button", { name: "Send offer" }).click();

  // 4. Supplier accepts revision 3.
  await expect(openCard(supplier)).toContainText("Buyer's counteroffer", { timeout: 10_000 });
  await expect(openCard(supplier)).toContainText("Revision 3");
  await openCard(supplier).getByRole("button", { name: "Accept offer" }).click();

  for (const [page, title] of [
    [supplier, "You accepted the offer (revision 3)"],
    [buyer, "Supplier accepted your offer (revision 3)"],
  ] as const) {
    const accepted = page.getByRole("article", { name: "Offer answer" }).filter({ hasText: title });
    await expect(accepted).toBeVisible({ timeout: 10_000 });
    await expect(accepted).toContainText("Total ₱6,500.00");
    await expect(accepted).toContainText("Downpayment 50% (₱3,250.00)");
    // Every revision stays in the chat; the two replaced ones are marked so, and nothing is left open.
    await expect(page.getByRole("article", { name: "Offer" }).filter({ hasText: "Replaced by a counteroffer" })).toHaveCount(2);
    await expect(openCard(page)).toHaveCount(0);
  }

  // Persistence: the agreed terms and history survive a reload.
  await buyer.reload();
  await expect(buyer.getByRole("article", { name: "Offer answer" })).toContainText("Total ₱6,500.00");
  await expect(buyer.getByRole("article", { name: "Offer" }).filter({ hasText: "Balance" }).last()).toContainText("₱3,250.00");
});
