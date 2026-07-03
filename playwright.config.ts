import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite runs against the real app + the real Supabase backend using a
 * fresh throwaway account per run (created in global-setup via the app's
 * own sign-up flow — email confirmation is auto-granted server-side).
 * Every test creates uniquely-named rooms, so tests stay independent.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // sequential: shared account, friendly to free-tier rate limits
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    storageState: "playwright/.auth/user.json",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
