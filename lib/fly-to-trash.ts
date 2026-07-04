/**
 * Decorative "flew into the trash" moment: small file/folder tiles lift off
 * the deleted rows, sail along an arc into the floating trash button, and
 * the button pops on landing. Purely cosmetic — capped at 3 tiles, skipped
 * entirely under prefers-reduced-motion, and never blocks the actual
 * mutation.
 */

const ICON_PATHS: Record<"file" | "folder", string[]> = {
  folder: [
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  ],
  file: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M10 9H8",
    "M16 13H8",
    "M16 17H8",
  ],
};

export interface FlySource {
  x: number;
  y: number;
  kind: "file" | "folder";
}

/** Screen positions of the tiles for the given node ids (rows or cards). */
export function flySourcesFor(ids: string[]): FlySource[] {
  if (typeof document === "undefined") return [];
  const sources: FlySource[] = [];
  for (const id of ids) {
    const el = document.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const kindAttr = el.getAttribute("data-node-kind");
    sources.push({
      // Lift off from the row's leading icon tile, not the row center.
      x: rect.left + 30,
      y: rect.top + rect.height / 2,
      kind: kindAttr === "file" ? "file" : "folder",
    });
  }
  return sources;
}

export function flyToTrash(sources: FlySource[]): void {
  if (typeof document === "undefined" || sources.length === 0) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const fab = document.querySelector<HTMLElement>("[data-trash-fab]");
  if (!fab) return;
  const target = fab.getBoundingClientRect();
  const tx = target.left + target.width / 2;
  const ty = target.top + target.height / 2;

  const chips = sources.slice(0, 3);
  let landed = 0;
  chips.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = `pointer-events-none fixed top-0 left-0 z-[90] flex size-8 items-center justify-center rounded-tile shadow-lg ${
      s.kind === "folder" ? "bg-folder-bg text-folder" : "bg-file-bg text-file"
    }`;
    el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[
      s.kind
    ]
      .map((d) => `<path d="${d}"/>`)
      .join("")}</svg>`;
    document.body.appendChild(el);

    const sx = s.x - 16;
    const sy = s.y - 16;
    const ex = tx - 16;
    const ey = ty - 16;
    // Bow the path upward so the chip reads as tossed, not slid; vary the
    // arc and tumble per chip so a multi-chip volley doesn't look cloned.
    const lift = Math.min(90, Math.hypot(ex - sx, ey - sy) * 0.18) + i * 12;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2 - lift;
    const tumble = 10 + i * 6;

    const anim = el.animate(
      [
        // Pickup: the tile visibly lifts off the row before travelling —
        // the eye gets a beat to lock onto what is about to fly.
        {
          offset: 0,
          transform: `translate(${sx}px, ${sy}px) scale(0.6) rotate(0deg)`,
          opacity: 0,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        },
        {
          offset: 0.22,
          transform: `translate(${sx}px, ${sy - 10}px) scale(1) rotate(${-(4 + i * 2)}deg)`,
          opacity: 1,
          easing: "cubic-bezier(0.45, 0.05, 0.55, 0.95)",
        },
        // Flight: an even-paced arc with a slow tumble — no end-of-path zip.
        {
          offset: 0.6,
          transform: `translate(${mx}px, ${my}px) scale(0.85) rotate(${tumble * 0.5}deg)`,
          opacity: 1,
          easing: "cubic-bezier(0.45, 0.05, 0.55, 0.95)",
        },
        // Stay fully visible until the chip is over the bin, then dissolve.
        { offset: 0.9, opacity: 1 },
        {
          offset: 1,
          transform: `translate(${ex}px, ${ey}px) scale(0.3) rotate(${tumble}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 850,
        delay: i * 90,
        easing: "linear", // per-segment easings above do the shaping
        fill: "both",
      },
    );
    const done = () => {
      el.remove();
      landed++;
      if (landed === chips.length) {
        // Arrival feedback, not a bounce: one quiet pulse so the eye
        // registers where the items went.
        fab.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.05)" },
            { transform: "scale(1)" },
          ],
          {
            duration: 200,
            easing: "cubic-bezier(0.23, 1, 0.32, 1)",
            composite: "add",
          },
        );
      }
    };
    anim.onfinish = done;
    anim.oncancel = () => el.remove();
  });
}
