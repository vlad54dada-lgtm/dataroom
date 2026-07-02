import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MAX_NAME_LENGTH = 255;

/** "1.5 MB", "12 KB", "0 B" — real size, no artificial floor. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  const text = i === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  return `${text} ${units[i]}`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Jul 2, 2026" — for card metadata and the Last modified column. */
export function formatDate(timestamp: number): string {
  return dateFormat.format(new Date(timestamp));
}

/** Names are trimmed on save; inner whitespace is preserved. */
export function normalizeName(name: string): string {
  return name.trim();
}

/**
 * Validates an already-normalized name. Returns an error message to show
 * inline, or null when the name is acceptable.
 */
export function validateName(name: string): string | null {
  if (name.length === 0) return "Name can't be empty";
  if (name.length > MAX_NAME_LENGTH)
    return `Name is too long (${MAX_NAME_LENGTH} characters max)`;
  return null;
}

/**
 * Splits on the LAST dot: "report.pdf" → {base:"report", ext:".pdf"},
 * "archive.tar.pdf" → {base:"archive.tar", ext:".pdf"}, "README" → ext "".
 * A lone leading dot (".pdf") counts as the extension with an empty base.
 */
export function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}
