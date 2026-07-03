import { expect, type Page } from "@playwright/test";

/** Unique, human-readable names so parallel/repeat runs never collide. */
export function uniq(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
    .toString(36)}`;
}

/**
 * Builds a small but fully valid one-page PDF (correct xref, Helvetica
 * text layer) in memory — the text is extractable by pdf.js, so it powers
 * the content-search assertions. No binary fixtures in the repo.
 */
export function makePdf(text: string): Buffer {
  const esc = text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  const stream = `BT /F1 14 Tf 72 720 Td (${esc}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/** Creates a dataroom from the home grid and opens it. */
export async function createAndOpenRoom(
  page: Page,
  name: string,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create dataroom" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create dataroom" }).click();
  await expect(page.getByText("Dataroom created").last()).toBeVisible();
  await page.getByRole("link", { name, exact: false }).click();
  await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
}

/** Creates a folder in the current room view. */
export async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New folder" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByText("Folder created").last()).toBeVisible();
}

/** Uploads an in-memory PDF through the dropzone's hidden input. */
export async function uploadPdf(
  page: Page,
  fileName: string,
  text: string,
): Promise<void> {
  await page.setInputFiles('input[type="file"]', {
    name: fileName,
    mimeType: "application/pdf",
    buffer: makePdf(text),
  });
  await expect(page.getByText(/1 file uploaded/).last()).toBeVisible({
    timeout: 45_000,
  });
}

/** The table row that carries the given item name. */
export function row(page: Page, name: string) {
  return page.locator("tr[data-node-id]", { hasText: name });
}

/**
 * Opens a folder row and WAITS for the breadcrumb to confirm arrival —
 * otherwise an immediately-following upload can race navigation and land
 * in the previous folder.
 */
export async function openFolder(page: Page, name: string): Promise<void> {
  await row(page, name).getByRole("link").click();
  await expect(
    page.locator('[aria-current="page"]', { hasText: name }),
  ).toBeVisible();
}
