import { defineConfig } from "@playwright/test";

// Screenshot tests for the most important pages, at phone and desktop width. They compare against the
// images in e2e/*-snapshots, so run them on a freshly seeded database (`supabase db reset`).
// Update the images on purpose with `npm run test:e2e:update`, then review the changed PNGs in the diff.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // one dev server, shared seed data
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      caret: "hide",
      stylePath: "e2e/screenshot.css",
    },
  },
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome", // the installed Google Chrome, so no browser download is needed
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
