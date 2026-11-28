// Speed check against a LOCAL production build: page HTML size, visitor JavaScript, database requests per page,
// chat payloads, and how much of the catalog is reachable. Not part of CI.
//
//   npm run build && npm run start          (in another terminal)
//   docker exec -i supabase_db_TULAY psql -U postgres -v ON_ERROR_STOP=1 < scripts/perf/load.sql   (optional)
//   node scripts/perf/measure.mjs [--poll]
//
// Database requests = new lines in the local Kong log whose user agent is "node" (the Next.js server).
// Each page is visited once to warm the caches, then measured.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.PERF_BASE_URL ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Local builds only (localhost)");
const KONG = "supabase_kong_TULAY";
const LOAD_CHAT = "c0ffee00-0000-4000-8000-000000000001";
const NEWEST = "NEWEST MESSAGE 1201";
const POLL = process.argv.includes("--poll");

const kongLog = () =>
  execFileSync("docker", ["logs", KONG], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 30 }).split("\n");
const nodeLinesAfter = (start) => kongLog().slice(start).filter((l) => l.endsWith('"node"'));
/** "GET /rest/v1/direct_messages?..." -> "GET direct_messages" */
const table = (l) => (/"(\w+) \/(?:rest|auth|storage)\/v1\/(?:rpc\/)?([\w.-]+)/.exec(l) ?? []).slice(1).join(" ");

function seedPassword() {
  const m = /crypt\('([^']+)'/.exec(readFileSync("supabase/seed.sql", "utf8"));
  if (!m) throw new Error("Seed password not found in supabase/seed.sql");
  return m[1];
}

/** Tracks compressed script bytes and Server Action response sizes for one page. */
async function instrument(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const scripts = new Set();
  const stats = { jsBytes: 0, actionBytes: [] };
  cdp.on("Network.responseReceived", (e) => e.type === "Script" && scripts.add(e.requestId));
  cdp.on("Network.loadingFinished", (e) => scripts.has(e.requestId) && (stats.jsBytes += e.encodedDataLength));
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && r.request().headers()["next-action"]) {
      stats.actionBytes.push((await r.body().catch(() => Buffer.alloc(0))).length);
    }
  });
  return stats;
}

async function visit(page, path, extra) {
  const stats = await instrument(page);
  const start = kongLog().length;
  const res = await page.goto(BASE + path, { waitUntil: "load" });
  const html = res ? (await res.body()).length : 0;
  const more = extra ? await extra(page) : {};
  await page.waitForTimeout(3000);
  const lines = nodeLinesAfter(start);
  await page.close(); // an open page keeps polling and would count toward the next measurement
  const byTable = {};
  for (const l of lines) byTable[table(l)] = (byTable[table(l)] ?? 0) + 1;
  return { path, htmlKB: +(html / 1024).toFixed(0), jsKB: +(stats.jsBytes / 1024).toFixed(0), db: lines.length, actionKB: stats.actionBytes.map((b) => +(b / 1024).toFixed(1)), byTable, ...more };
}

const showing = async (page) => ({ showing: (await page.getByText(/^Showing .* of [\d,]+$/).first().textContent().catch(() => null)) ?? "-" });
const newestVisible = async (page) => {
  const ok = await page.getByText(NEWEST).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  return { newestVisible: ok };
};

const browser = await chromium.launch({ channel: "chrome" });
const results = [];
try {
  const visitorPaths = ["/", "/marketplace", "/suppliers"];
  // Warm the server caches, then measure each page in a fresh context (cold browser cache).
  const warm = await browser.newContext();
  for (const p of visitorPaths) await (await warm.newPage()).goto(BASE + p, { waitUntil: "load" });
  await warm.close();
  for (const p of visitorPaths) {
    const ctx = await browser.newContext();
    results.push({ who: "visitor", ...(await visit(await ctx.newPage(), p, p === "/marketplace" ? showing : undefined)) });
    await ctx.close();
  }
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  results.push({ who: "visitor", path: "/sitemap.xml", productUrls: (sitemap.match(/\/products\//g) ?? []).length });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Your business email").fill("buyer@tulay.test");
  await page.getByLabel("Password", { exact: true }).fill(seedPassword());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const signed = ["/", "/buyer", "/buyer/messages"];
  for (const p of signed) await page.goto(BASE + p, { waitUntil: "load" }); // warm
  await page.close();
  for (const p of signed) results.push({ who: "buyer", ...(await visit(await ctx.newPage(), p)) });
  results.push({ who: "buyer", ...(await visit(await ctx.newPage(), `/buyer/messages?c=${LOAD_CHAT}`, newestVisible)) });

  if (POLL) {
    // One idle poll cycle on the home page (the messages button refreshes every 30 seconds).
    const idle = await ctx.newPage();
    await idle.goto(BASE + "/", { waitUntil: "load" });
    await idle.waitForTimeout(3000);
    const start = kongLog().length;
    await idle.waitForTimeout(31_000);
    results.push({ who: "buyer", path: "/ (31 s idle)", db: nodeLinesAfter(start).length });
  }
  await ctx.close();
} finally {
  await browser.close();
}

for (const r of results) {
  const { byTable, ...row } = r;
  console.log(JSON.stringify(row));
  if (byTable) console.log("   ", Object.entries(byTable).map(([k, v]) => `${k}×${v}`).join(", "));
}
