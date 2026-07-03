import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Registers a fresh account through the app's own sign-up UI (also acting
 * as the sign-up smoke test) and saves the authenticated storage state for
 * every spec. A new user per run keeps the data plane hermetic.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByRole("button", { name: "Create one" }).click();
  await page
    .getByLabel("Email")
    .fill(`e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("e2e-DataRoom-2026");
  await page.getByRole("button", { name: "Create account" }).click();

  // Signed in → redirected to the dataroom grid.
  await page.getByRole("heading", { name: "Datarooms" }).waitFor({
    timeout: 30_000,
  });

  const statePath = path.join(process.cwd(), "playwright/.auth/user.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
  await browser.close();
}
