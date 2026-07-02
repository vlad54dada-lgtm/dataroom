/**
 * PDF acceptance policy (dropzone `accept` is advisory only — drag&drop
 * bypasses it, so this runs in code for every incoming file):
 * 1. The extension must be `.pdf` (case-insensitive) — always required.
 * 2. A positive MIME (`application/pdf`) passes.
 * 3. A contradicting MIME (e.g. `image/png`) fails outright.
 * 4. An EMPTY/unknown MIME falls back to magic-number sniffing: the first
 *    5 bytes must be the `%PDF-` signature. A `.pdf`-renamed PNG with an
 *    empty MIME fails here.
 */

const PDF_MIME = "application/pdf";
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export async function isPdf(file: File): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith(".pdf")) return false;
  if (file.type === PDF_MIME) return true;
  if (file.type !== "") return false; // MIME present and contradicting
  const header = new Uint8Array(
    await file.slice(0, PDF_SIGNATURE.length).arrayBuffer(),
  );
  return PDF_SIGNATURE.every((byte, i) => header[i] === byte);
}

/** Mixed batches upload the valid PDFs and report the invalid ones. */
export async function partitionPdfs(
  files: File[],
): Promise<{ valid: File[]; invalid: File[] }> {
  const valid: File[] = [];
  const invalid: File[] = [];
  for (const file of files) {
    if (await isPdf(file)) valid.push(file);
    else invalid.push(file);
  }
  return { valid, invalid };
}
