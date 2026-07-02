/**
 * Custom drag-and-drop payload types. Neither includes "Files", so the
 * upload dropzone's overlay never reacts to internal drags.
 */

/** JSON string[] of node ids being moved between folders. */
export const MOVE_MIME = "application/x-dataroom-nodes";

/** Single trashed node id being dragged out of the trash stack to restore. */
export const RESTORE_MIME = "application/x-dataroom-restore";

/**
 * Replaces the browser's blurry row-snapshot drag ghost with a crisp chip:
 * a colored tile, the item's name, and a "+N" badge for multi-drags — it
 * reads as "I picked this file up". The element must be in the DOM when
 * setDragImage samples it; it's parked far offscreen and removed on the
 * next tick.
 */
export function applyDragChip(
  dt: DataTransfer,
  label: string,
  count: number,
  kind: "file" | "folder",
): void {
  if (typeof document === "undefined") return;
  const chip = document.createElement("div");
  chip.className =
    "pointer-events-none fixed flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-lg";
  chip.style.top = "-1000px";
  chip.style.left = "-1000px";
  chip.style.maxWidth = "16rem";

  const tile = document.createElement("span");
  tile.className = `flex size-5 shrink-0 rounded-md ${
    kind === "folder" ? "bg-folder-bg" : "bg-file-bg"
  }`;
  const dot = document.createElement("span");
  dot.className = `m-auto size-2.5 rounded-sm ${
    kind === "folder" ? "bg-folder" : "bg-file"
  }`;
  tile.appendChild(dot);

  const text = document.createElement("span");
  text.className = "truncate";
  text.textContent = label;

  chip.append(tile, text);
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className =
      "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white";
    badge.textContent = `+${count - 1}`;
    chip.appendChild(badge);
  }

  document.body.appendChild(chip);
  dt.setDragImage(chip, 18, 22);
  setTimeout(() => chip.remove(), 0);
}

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
