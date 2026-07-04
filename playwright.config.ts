import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite runs against the real app + the real Supabase backend using a
 * fresh throwaway account per run (created in global-setup via the app's
 * own sign-up flow — email confirmation is auto-granted server-side).
 * Every test creates uniquely-named rooms, so tests stay independent.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // CI runners are slow and sit far from the Supabase region — give the
  // same assertions more headroom there instead of loosening them locally.
  timeout: CI ? 90_000 : 60_000,
  expect: { timeout: CI ? 20_000 : 15_000 },
  fullyParallel: false,
  workers: 1, // sequential: shared account, friendly to free-tier rate limits
  retries: CI ? 2 : 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    storageState: "playwright/.auth/user.json",
    trace: "on-first-retry",
  },
  // Chromium + the Safari engine, desktop AND iPhone viewport: the suite
  // must hold in WebKit too, where fonts, focus behavior, and PDF
  // rendering all differ from Chrome.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    // CI tests the PRODUCTION build (compiled in the previous step) — the
    // dev server's compile-on-demand added multi-second first hits that
    // read as flakes on slow runners. Locally the dev server stays.
    command: CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
