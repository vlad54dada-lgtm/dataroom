import { expect, test } from "@playwright/test";
import {
  createAndOpenRoom,
  createFolder,
  openFolder,
  row,
  uniq,
  uploadPdf,
} from "./helpers";

test.describe("folders and files", () => {
  test("nested folders, URL-driven navigation, refresh restores location", async ({
    page,
  }) => {
    const room = uniq("Nav Room");
    await createAndOpenRoom(page, room);
    await createFolder(page, "Contracts");
    await openFolder(page, "Contracts");
    await expect(page).toHaveURL(/folder=/);
    await createFolder(page, "Signed");
    await openFolder(page, "Signed");

    // Deep refresh: the exact location comes back from the URL.
    await page.reload();
    await expect(
      page.locator('[aria-current="page"]', { hasText: "Signed" }),
    ).toBeVisible();

    // Breadcrumb climbs back to the room root.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: room })
      .click();
    await expect(row(page, "Contracts")).toBeVisible();
  });

  test("duplicate folder name is blocked inline", async ({ page }) => {
    await createAndOpenRoom(page, uniq("Dup Folder Room"));
    await createFolder(page, "Legal");
    await page.getByRole("button", { name: "New folder" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Legal");
    await dialog.getByRole("button", { name: "Create folder" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/already exists/i);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("upload PDFs; a same-named file gets a numbered suffix", async ({
    page,
  }) => {
    await createAndOpenRoom(page, uniq("Upload Room"));
    await uploadPdf(page, "report.pdf", "quarterly numbers");
    await expect(row(page, "report.pdf")).toBeVisible();
    await uploadPdf(page, "report.pdf", "quarterly numbers again");
    await expect(row(page, "report (1).pdf")).toBeVisible();
  });

  test("non-PDF files are rejected with a toast", async ({ page }) => {
    await createAndOpenRoom(page, uniq("Reject Room"));
    // Contradicting MIME on a .pdf name — the in-code validator's case #3.
    await page.setInputFiles('input[type="file"]', {
      name: "fake.pdf",
      mimeType: "text/plain",
      buffer: Buffer.from("this is definitely not a pdf"),
    });
    await expect(
      page.getByText(/isn't a PDF and was skipped/).last(),
    ).toBeVisible();
  });

  test("rename a file from the kebab keeps it findable", async ({ page }) => {
    await createAndOpenRoom(page, uniq("Rename Room"));
    await uploadPdf(page, "draft.pdf", "renameable");
    await row(page, "draft.pdf")
      .getByRole("button", { name: "Actions for draft.pdf" })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("final.pdf");
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByText("File renamed").last()).toBeVisible();
    await expect(row(page, "final.pdf")).toBeVisible();
  });

  test("viewer renders the document with paging and zoom", async ({ page }) => {
    await createAndOpenRoom(page, uniq("Viewer Room"));
    await uploadPdf(page, "deck.pdf", "hello viewer");
    await row(page, "deck.pdf").locator("[data-row-primary]").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("Page 1 of 1")).toBeVisible();
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(dialog.getByText("125%")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("trash a file, Undo brings it back", async ({ page }) => {
    await createAndOpenRoom(page, uniq("Trash Room"));
    await uploadPdf(page, "victim.pdf", "soon gone");
    await row(page, "victim.pdf")
      .getByRole("button", { name: "Actions for victim.pdf" })
      .click();
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await expect(row(page, "victim.pdf")).toBeHidden();
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(row(page, "victim.pdf")).toBeVisible();
  });
});
