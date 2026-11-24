import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

// Master prompt acceptance tests 1, 6 and 7: a product RFQ goes privately to that supplier's chat as a
// structured card (no public request), survives a reload, and only the two parties can see it.
// Uses seed data: buyer2 asks PrintHaus Manila (supplier1) about its crew-neck shirt.
const PRODUCT = "/products/c1000000-0000-4000-8000-000000000001";
const NOTE = `E2E RFQ ${Date.now()}`;

// The dev server compiles each route on first use, so the first run is slow.
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ navigationTimeout: 60_000 });
test.skip(({ isMobile }) => isMobile, "One run is enough; the phone layout is covered by the screenshot tests.");

test("a product RFQ opens the supplier's private chat and posts a card", async ({ page }) => {
  await signIn(page, "buyer2@tulay.test");
  await page.goto(PRODUCT);
  await page.getByRole("link", { name: "Request a Quote" }).click();

  await expect(page).toHaveURL(/\/buyer\/messages\?supplier=/, { timeout: 60_000 });
  // Scoped to the RFQ form: the router keeps the product page (with its own Quantity field) hidden for Back.
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Request a quote from PrintHaus Manila" }) });
  await expect(form.getByText("Cotton crew-neck shirt with 1-colour print")).toBeVisible();
  // Regression: rewriting the URL here once re-mounted the page and the form vanished a moment later.
  await page.waitForTimeout(3_000);
  await expect(form).toBeVisible();

  await form.getByLabel("Quantity").fill("50");
  await form.getByLabel("Target price per unit (₱, optional)").fill("120");
  await form.getByLabel("Specifications").fill("Cotton, full-colour print");
  await form.getByLabel("Delivery city").fill("Las Piñas");
  await form.getByLabel("Delivery province").fill("Metro Manila");
  await form.getByLabel("Additional requirements").fill(NOTE);
  await form.getByRole("button", { name: "Send RFQ" }).click();

  const card = page.getByRole("article", { name: "Request for quotation" }).filter({ hasText: NOTE });
  await expect(card).toBeVisible();
  await expect(card).toContainText("₱120.00 per pcs");
  await expect(card).toContainText("₱6,000.00");

  // Persistence: the card is still there after a reload.
  await page.reload();
  await page.getByRole("button", { name: /PrintHaus Manila/ }).first().click();
  await expect(page.getByRole("article", { name: "Request for quotation" }).filter({ hasText: NOTE })).toBeVisible();

  // No public request was created for it.
  await page.goto("/requests");
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("the supplier sees the RFQ; another buyer does not", async ({ page }) => {
  await signIn(page, "supplier1@tulay.test");
  await page.goto("/supplier/messages");
  await page.getByRole("button", { name: /Bea Santos/ }).first().click();
  await expect(page.getByRole("article", { name: "Request for quotation" }).filter({ hasText: NOTE })).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "buyer3@tulay.test");
  await page.goto("/buyer/messages");
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("a new message appears on the other party's open chat without a reload", async ({ browser }) => {
  const supplier = await (await browser.newContext()).newPage();
  await signIn(supplier, "supplier1@tulay.test");
  await supplier.goto("/supplier/messages");
  await supplier.getByRole("button", { name: /Bea Santos/ }).first().click();

  const buyer = await (await browser.newContext()).newPage();
  await signIn(buyer, "buyer2@tulay.test");
  await buyer.goto("/buyer/messages");
  await buyer.getByRole("button", { name: /PrintHaus Manila/ }).first().click();
  const text = `Live ${Date.now()}`;
  await buyer.getByRole("textbox", { name: "Message" }).fill(text);
  await buyer.getByRole("button", { name: "Send message" }).click();

  // Well under the 30-second poll, so this passes only through Realtime.
  await expect(supplier.getByText(text, { exact: true })).toBeVisible({ timeout: 5_000 });
});
