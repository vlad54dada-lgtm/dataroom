import type { PDFDocumentProxy } from "pdfjs-dist";

const MAX_PAGES = 30;
const MAX_CHARS = 50_000;
/** Rendered at 2× the ~176px display width so hover previews stay crisp. */
const THUMB_WIDTH = 320;

export interface PdfAnalysis {
  /** Searchable text, or null for scanned/broken documents. */
  text: string | null;
  /** First page as a small webp (the hover preview), or null. */
  thumbnail: Blob | null;
}

async function textFromDoc(doc: PDFDocumentProxy): Promise<string | null> {
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
}

async function thumbFromDoc(doc: PDFDocumentProxy): Promise<Blob | null> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.8),
    );
  } catch {
    return null;
  }
}

/**
 * One parse, two artifacts: searchable text (first 30 pages / 50k chars —
 * plenty for due-diligence search) and a first-page webp preview. Both are
 * null-tolerant: scanned or broken documents upload fine, they just aren't
 * content-matchable / previewable.
 *
 * pdf.js is imported LAZILY: it touches browser-only APIs at module scope,
 * which crashes the server render of any page that imports this file — and
 * deferring it also keeps ~1MB out of the bundle until the first upload.
 */
export async function analyzePdf(
  file: File,
  opts?: { thumbnail?: boolean },
): Promise<PdfAnalysis> {
  const pdfjs = await import("pdfjs-dist");
  // Parse in a worker so big documents never block the main thread.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await loadingTask.promise;
    return {
      text: await textFromDoc(doc),
      thumbnail:
        opts?.thumbnail === false ? null : await thumbFromDoc(doc),
    };
  } catch {
    return { text: null, thumbnail: null };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

/** Text only — used where the preview already exists (version restore). */
export async function extractPdfText(file: File): Promise<string | null> {
  return (await analyzePdf(file, { thumbnail: false })).text;
}
