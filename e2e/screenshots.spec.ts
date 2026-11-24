import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./auth";

// Waits until the page has finished loading and its web fonts are ready, so the screenshot is stable.
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

test("home", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(page).toHaveScreenshot("home.png", { fullPage: true, mask: [page.locator("time")] });
});

test("marketplace", async ({ page }) => {
  await page.goto("/marketplace");
  await settle(page);
  await expect(page).toHaveScreenshot("marketplace.png", { fullPage: true, mask: [page.locator("time")] });
});

test("product", async ({ page }) => {
  await page.goto("/products/c1000000-0000-4000-8000-000000000001");
  await settle(page);
  await expect(page).toHaveScreenshot("product.png", { fullPage: true, mask: [page.locator("time")] });
});

test("cart", async ({ page }) => {
  await signIn(page, "buyer@tulay.test");
  await page.goto("/buyer/cart");
  await settle(page);
  await expect(page).toHaveScreenshot("cart.png", { fullPage: true, mask: [page.locator("time")] });
});

test("supplier-dashboard", async ({ page }) => {
  await signIn(page, "supplier1@tulay.test");
  await page.goto("/supplier");
  await settle(page);
  await expect(page).toHaveScreenshot("supplier-dashboard.png", {
    fullPage: true,
    mask: [
      page.locator("time"),
      // Notification timestamps (plain text, not <time>) depend on when the seed ran.
      page.getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
      // Counted from today's date, so it changes every day.
      page.getByText(/^Waiting \d+ business days?$/),
    ],
  });
});
