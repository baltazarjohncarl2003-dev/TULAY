import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

// The seed password lives only in supabase/seed.sql. It is read at runtime and never written to a file.
function seedPassword(): string {
  const sql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
  const match = /crypt\('([^']+)'/.exec(sql);
  if (!match) throw new Error("Could not find the seed password in supabase/seed.sql");
  return match[1];
}

/** Signs a seeded account in through the /login form and waits until the app has left /login. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Your business email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(seedPassword());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
