import * as pdfjs from "pdfjs-dist";

// pdf.js parses in a worker so big documents never block the main thread.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MAX_PAGES = 30;
const MAX_CHARS = 50_000;

/**
 * Extracts searchable text from a PDF at upload time (first 30 pages /
 * 50k chars — plenty for due-diligence search). Returns null for scanned
 * or broken documents: they upload fine, they just aren't content-matchable.
 */
export async function extractPdfText(file: File): Promise<string | null> {
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await loadingTask.promise;
    let text = "";
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let i = 1; i <= pages && text.length < MAX_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ") + "\n";
    }
    const trimmed = text.slice(0, MAX_CHARS).trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
