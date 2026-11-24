import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./auth";

// Master prompt acceptance tests 4 and 8 through the UI: an accepted PHP 6,500 offer at 50% down becomes an order
// after both parties confirm the details; the buyer pays PHP 3,250 down (fake gateway), the supplier sees the
// balance unpaid, the buyer pays the PHP 3,250 balance, and the order is fully paid.
// Seed: buyer@tulay.test (Alex Reyes, has a saved address) and Cebu SubliPrints (supplier3).
// Needs a fresh `supabase db reset` (their chat starts empty).
const SUPPLIER = "b1000000-0000-4000-8000-000000000003";

test.describe.configure({ timeout: 240_000 });
test.use({ navigationTimeout: 60_000 });
test.skip(({ isMobile }) => isMobile, "One run is enough; the phone layout is covered by the screenshot tests.");

const details = (page: Page) => page.getByRole("article", { name: "Order details" });

/** On the fake gateway page: check the amount, then simulate a successful payment. */
async function payOnFakeGateway(page: Page, amount: string) {
  await page.waitForURL(/\/pay\/fake\//);
  await expect(page.getByText(amount).first()).toBeVisible();
  await page.getByRole("button", { name: "Pay now (simulate success)" }).click();
  await page.waitForURL(/\/buyer\/orders/);
}

test("an agreed offer is paid as downpayment, then balance", async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  await signIn(buyer, "buyer@tulay.test");
  await buyer.goto(`/buyer/messages?supplier=${SUPPLIER}`);
  await buyer.getByRole("textbox", { name: "Message" }).fill("Hi, 50 printed shirts please.");
  await buyer.getByRole("button", { name: "Send message" }).click();
  await buyer.getByRole("button", { name: "Set an offer" }).click();
  const form = buyer.locator("form", { has: buyer.getByRole("heading", { name: "Set an offer" }) });
  await form.getByLabel("Product", { exact: true }).fill("Printed Shirt");
  await form.getByLabel("Price per unit (₱)").fill("125");
  await form.getByLabel("Quantity").fill("50");
  await form.getByLabel("Shipping / delivery fee (₱)").fill("250");
  await form.getByLabel("Lead time (days)").fill("7");
  await form.getByLabel("Downpayment (%)").fill("50");
  await form.getByRole("button", { name: "Send offer" }).click();

  // Supplier accepts, sets the return class and confirms.
  const supplier = await (await browser.newContext()).newPage();
  await signIn(supplier, "supplier3@tulay.test");
  await supplier.goto("/supplier/messages");
  await supplier.getByRole("button", { name: /Alex Reyes|Café/ }).first().click();
  await supplier.getByRole("button", { name: "Accept offer" }).click();
  await expect(details(supplier)).toBeVisible({ timeout: 10_000 });
  await details(supplier).getByLabel("Return class").selectOption("standard");
  await details(supplier).getByRole("button", { name: "Save" }).click();
  await expect(details(supplier)).toContainText("DRAFT, pending legal review.");

  // Buyer sets the address; that is a new version, so both confirm it.
  await expect(details(buyer)).toBeVisible({ timeout: 10_000 });
  await details(buyer).getByRole("button", { name: "Use this address" }).click();
  await expect(details(buyer)).toContainText("12 Maginhawa St");
  await details(buyer).getByRole("button", { name: "I agree to these terms and confirm" }).click();
  await expect(details(buyer)).toContainText("You: Confirmed");

  await expect(details(supplier)).toContainText("12 Maginhawa St", { timeout: 10_000 });
  await details(supplier).getByRole("button", { name: "I agree to these terms and confirm" }).click();
  await expect(details(supplier)).toContainText("Both confirmed. Waiting for the buyer to pay.");

  // Downpayment: exactly the agreed PHP 3,250.
  await details(buyer).getByRole("button", { name: "Pay downpayment ₱3,250.00" }).click({ timeout: 10_000 });
  await payOnFakeGateway(buyer, "₱3,250.00");

  // Supplier: the order is confirmed and the balance is unpaid, so it cannot ship yet.
  await supplier.reload();
  await supplier.getByRole("button", { name: /Alex Reyes|Café/ }).first().click();
  await details(supplier).getByRole("link", { name: "View order" }).click();
  await expect(supplier.getByText("Balance unpaid: ₱3,250.00. The order can ship once the buyer pays it.")).toBeVisible();
  await supplier.getByRole("button", { name: "Remind buyer to pay the balance" }).click();
  await expect(supplier.getByText("Reminder sent")).toBeVisible();
  const orderUrl = new URL(supplier.url()).pathname.replace("/supplier/", "/buyer/");

  // Buyer pays the balance from the order page.
  await buyer.goto(orderUrl);
  await expect(buyer.getByText("Downpayment paid").first()).toBeVisible(); // also in the status history
  await buyer.getByRole("button", { name: "Pay balance ₱3,250.00" }).click();
  await payOnFakeGateway(buyer, "₱3,250.00");
  await buyer.goto(orderUrl);
  await expect(buyer.getByText("₱6,500.00 (fully paid)")).toBeVisible();

  await supplier.reload();
  await expect(supplier.getByText(/Balance unpaid/)).toHaveCount(0);
});
