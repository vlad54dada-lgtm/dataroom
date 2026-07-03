/**
 * Custom drag-and-drop payload types. Neither includes "Files", so the
 * upload dropzone's overlay never reacts to internal drags.
 */

/** JSON string[] of node ids being moved between folders. */
export const MOVE_MIME = "application/x-dataroom-nodes";

/** Single trashed node id being dragged out of the trash stack to restore. */
export const RESTORE_MIME = "application/x-dataroom-restore";

/**
 * Custom drag ghost. Browsers render native drag images half-transparent
 * and washed out; instead the native image is replaced with a blank pixel
 * and a SOLID card follows the cursor from a document-level dragover
 * listener — it reads as physically holding the file. Multi-drags show a
 * small stack behind the card plus a round count badge.
 */

let ghostEl: HTMLDivElement | null = null;
let moveHandler: ((e: DragEvent) => void) | null = null;
let endHandler: (() => void) | null = null;
let safetyHandler: ((e: PointerEvent) => void) | null = null;

const BLANK_IMG = typeof Image !== "undefined" ? new Image() : null;
if (BLANK_IMG) {
  BLANK_IMG.src =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
}

function cleanupGhost(): void {
  if (moveHandler) document.removeEventListener("dragover", moveHandler);
  if (endHandler) {
    document.removeEventListener("dragend", endHandler);
    document.removeEventListener("drop", endHandler);
  }
  if (safetyHandler) document.removeEventListener("pointermove", safetyHandler);
  moveHandler = null;
  endHandler = null;
  safetyHandler = null;
  ghostEl?.remove();
  ghostEl = null;
}

export function startDragGhost(
  dt: DataTransfer,
  label: string,
  count: number,
  kind: "file" | "folder",
): void {
  if (typeof document === "undefined") return;
  cleanupGhost();
  if (BLANK_IMG) dt.setDragImage(BLANK_IMG, 0, 0);

  ghostEl = document.createElement("div");
  ghostEl.className = "pointer-events-none fixed top-0 left-0 z-[100]";
  ghostEl.style.willChange = "transform";
  ghostEl.style.transform = "translate(-1000px, -1000px)";

  const stack = document.createElement("div");
  stack.className = "relative";

  // Offset cards behind the main one sell the "stack in hand" effect.
  if (count > 1) {
    for (const offset of count > 2 ? [8, 4] : [4]) {
      const behind = document.createElement("div");
      behind.className =
        "absolute inset-0 rounded-xl border bg-card shadow-md";
      behind.style.transform = `translate(${offset}px, ${offset}px)`;
      stack.appendChild(behind);
    }
  }

  const card = document.createElement("div");
  card.className =
    "relative flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium text-foreground shadow-xl";
  card.style.maxWidth = "16rem";

  const tile = document.createElement("span");
  tile.className = `flex size-6 shrink-0 rounded-md ${
    kind === "folder" ? "bg-folder-bg" : "bg-file-bg"
  }`;
  const dot = document.createElement("span");
  dot.className = `m-auto size-3 rounded-sm ${
    kind === "folder" ? "bg-folder" : "bg-file"
  }`;
  tile.appendChild(dot);

  const text = document.createElement("span");
  text.className = "truncate";
  text.textContent = label;

  card.append(tile, text);
  stack.appendChild(card);

  if (count > 1) {
    const badge = document.createElement("span");
    badge.className =
      "absolute -top-2.5 -left-2.5 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-md";
    badge.textContent = count > 99 ? "99+" : String(count);
    stack.appendChild(badge);
  }

  ghostEl.appendChild(stack);
  document.body.appendChild(ghostEl);

  moveHandler = (e: DragEvent) => {
    if (ghostEl && (e.clientX !== 0 || e.clientY !== 0)) {
      ghostEl.style.transform = `translate(${e.clientX + 14}px, ${
        e.clientY + 12
      }px) rotate(2deg)`;
    }
  };
  endHandler = () => cleanupGhost();
  // Safety net: if the drag SOURCE unmounts mid-drag (e.g. the trash stack
  // collapses), the browser never fires dragend and the ghost would freeze
  // on screen. Pointer events are suppressed during a drag, so the first
  // buttons-up pointermove afterwards means the drag is definitely over.
  safetyHandler = (e: PointerEvent) => {
    if (e.buttons === 0) cleanupGhost();
  };
  document.addEventListener("dragover", moveHandler);
  document.addEventListener("dragend", endHandler);
  document.addEventListener("drop", endHandler);
  document.addEventListener("pointermove", safetyHandler);
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
