import { expect, test } from "@playwright/test";
import {
  createAndOpenRoom,
  createFolder,
  openFolder,
  row,
  uniq,
  uploadPdf,
} from "./helpers";

test.describe("search and trash", () => {
  test("name search, content search with snippet, jump to location, ?q= survives refresh", async ({
    page,
  }) => {
    await createAndOpenRoom(page, uniq("Search Room"));
    await createFolder(page, "Contracts");
    await openFolder(page, "Contracts");
    await uploadPdf(page, "merger.pdf", "confidential merger agreement e2e");

    const search = page.getByRole("textbox", { name: "Search this dataroom" });

    // Content search: matched words come back highlighted with a badge.
    await search.fill("confidential");
    await expect(page.getByText(/1 result/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Text match")).toBeVisible();
    await expect(page.locator("mark", { hasText: "confidential" })).toBeVisible();

    // The query lives in the URL and survives a refresh.
    await expect(page).toHaveURL(/q=confidential/);
    await page.reload();
    await expect(page.getByText("Text match")).toBeVisible({ timeout: 30_000 });

    // Jump to the folder that contains the hit.
    await page.getByRole("button", { name: /Open location/ }).click();
    await expect(
      page.locator('[aria-current="page"]', { hasText: "Contracts" }),
    ).toBeVisible();
    await expect(row(page, "merger.pdf")).toBeVisible();
  });

  test("trash a folder with a file, restore just the file out of it", async ({
    page,
  }) => {
    // The trash is shared across the whole account — the folder name must
    // be unique or retries collide with their own leftovers.
    const bundle = uniq("Bundle");
    await createAndOpenRoom(page, uniq("Partial Room"));
    await createFolder(page, bundle);
    await openFolder(page, bundle);
    await uploadPdf(page, "inside.pdf", "trapped file");
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link")
      .last()
      .click();
    await expect(row(page, bundle)).toBeVisible();

    await row(page, bundle)
      .getByRole("button", { name: `Actions for ${bundle}` })
      .click();
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await expect(row(page, bundle)).toBeHidden();
    const roomUrl = page.url();

    // Trash page: expand the deleted folder and pull the file out alone.
    await page.goto("/trash");
    await page
      .getByRole("button", { name: `Show contents of ${bundle}` })
      .click();
    const child = page.locator("div.group\\/branch", { hasText: "inside.pdf" });
    await expect(child).toBeVisible();
    await child.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Restored").last()).toBeVisible();
    await expect(child).toBeHidden();

    // The file landed where the deleted folder used to live (room root);
    // the folder itself is still in the trash.
    await expect(page.getByText(bundle, { exact: false })).toBeVisible();
    await page.goto(roomUrl);
    await expect(row(page, "inside.pdf")).toBeVisible();
  });
});
