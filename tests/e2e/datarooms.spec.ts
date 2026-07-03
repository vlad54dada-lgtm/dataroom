import { expect, test } from "@playwright/test";
import { uniq } from "./helpers";

test.describe("datarooms", () => {
  test("create a dataroom and see it in the grid", async ({ page }) => {
    const name = uniq("Acme Deal");
    await page.goto("/");
    await page.getByRole("button", { name: "Create dataroom" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create dataroom" }).click();
    await expect(page.getByText("Dataroom created").last()).toBeVisible();
    await expect(page.getByRole("link", { name })).toBeVisible();
  });

  test("duplicate dataroom name is blocked inline", async ({ page }) => {
    const name = uniq("Duplicate Room");
    await page.goto("/");
    for (const attempt of [1, 2]) {
      await page.getByRole("button", { name: "Create dataroom" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByRole("button", { name: "Create dataroom" }).click();
      if (attempt === 1) {
        await expect(page.getByText("Dataroom created").last()).toBeVisible();
      }
    }
    // Second attempt: the dialog stays open with an inline error.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toContainText(/already exists/i);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("edit a dataroom name from the card menu", async ({ page }) => {
    const name = uniq("Old Name");
    const renamed = uniq("New Name");
    await page.goto("/");
    await page.getByRole("button", { name: "Create dataroom" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create dataroom" }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();

    // The card itself is the role=link; the kebab lives inside it.
    const card = page.getByRole("link", { name });
    await card.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Dataroom updated").last()).toBeVisible();
    await expect(page.getByRole("link", { name: renamed })).toBeVisible();
  });

  test("trash a dataroom, then Undo restores it", async ({ page }) => {
    const name = uniq("Disposable");
    await page.goto("/");
    await page.getByRole("button", { name: "Create dataroom" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create dataroom" }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();

    // The card itself is the role=link; the kebab lives inside it.
    const card = page.getByRole("link", { name });
    await card.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await expect(page.getByText("Moved to trash").last()).toBeVisible();
    await expect(page.getByRole("link", { name })).toBeHidden();

    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(page.getByRole("link", { name })).toBeVisible();
  });
});
