import { expect, test } from "@playwright/test";
import { createAndOpenRoom, createFolder, row, uniq, uploadPdf } from "./helpers";

test.describe("keyboard and selection", () => {
  test("arrows walk rows, Ctrl+A selects all, Escape clears, Delete trashes", async ({
    page,
  }) => {
    await createAndOpenRoom(page, uniq("Keys Room"));
    await createFolder(page, "Alpha");
    await createFolder(page, "Beta");
    await uploadPdf(page, "gamma.pdf", "keyboard fodder");

    // Roving focus: ArrowDown moves to the next row's primary control.
    await page.locator("[data-row-primary]").first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.locator("tr[data-node-id]").nth(1).locator("[data-row-primary]"),
    ).toBeFocused();

    // Select all / clear. (.last() — an sr-only live twin shares the text.)
    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.getByText("3 selected").last()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("3 selected").last()).toBeHidden();

    // Shift+click selects the whole stretch.
    await row(page, "Alpha").getByRole("checkbox").click();
    await row(page, "gamma.pdf").getByRole("checkbox").click({
      modifiers: ["Shift"],
    });
    await expect(page.getByText("3 selected").last()).toBeVisible();

    // Delete sends the selection to the trash; Undo brings it back.
    await page.locator("[data-row-primary]").first().focus();
    await page.keyboard.press("Delete");
    await expect(page.getByText(/items moved to trash/).last()).toBeVisible();
    await expect(row(page, "Alpha")).toBeHidden();
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(row(page, "Alpha")).toBeVisible();
    await expect(row(page, "gamma.pdf")).toBeVisible();
  });

  test("'/' focuses search and Escape clears it", async ({ page }) => {
    await createAndOpenRoom(page, uniq("Slash Room"));
    await page.keyboard.press("/");
    const search = page.getByRole("textbox", { name: "Search this dataroom" });
    await expect(search).toBeFocused();
    await search.fill("something");
    await page.keyboard.press("Escape");
    await expect(search).toHaveValue("");
  });
});
