/**
 * Custom drag-and-drop payload types. Neither includes "Files", so the
 * upload dropzone's overlay never reacts to internal drags.
 */

/** JSON string[] of node ids being moved between folders. */
export const MOVE_MIME = "application/x-dataroom-nodes";

/** Single trashed node id being dragged out of the trash stack to restore. */
export const RESTORE_MIME = "application/x-dataroom-restore";

export function readIds(dt: DataTransfer, mime: string): string[] {
  try {
    const raw = dt.getData(mime);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
