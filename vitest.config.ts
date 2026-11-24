import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// "@/*" mirrors tsconfig.json. "server-only" is provided by Next.js at build time; tests that import a
// client component which imports a Server Action reach it, so map it to Next's own empty module.
export default defineConfig({
  // e2e/ holds Playwright screenshot tests; they run with `npm run test:e2e`, not Vitest.
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
});
