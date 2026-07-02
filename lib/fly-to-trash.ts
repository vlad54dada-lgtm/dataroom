/**
 * Decorative "flew into the trash" moment: small file/folder tiles detach
 * from the deleted rows and accelerate into the floating trash button, which
 * pops on landing. Purely cosmetic — capped at 3 tiles, skipped entirely
 * under prefers-reduced-motion, and never blocks the actual mutation.
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
    el.className = `pointer-events-none fixed top-0 left-0 z-[90] flex size-8 items-center justify-center rounded-tile shadow-md ${
      s.kind === "folder" ? "bg-folder-bg text-folder" : "bg-file-bg text-file"
    }`;
    el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[
      s.kind
    ]
      .map((d) => `<path d="${d}"/>`)
      .join("")}</svg>`;
    document.body.appendChild(el);

    const anim = el.animate(
      [
        { transform: `translate(${s.x - 16}px, ${s.y - 16}px) scale(1)`, opacity: 1 },
        {
          transform: `translate(${tx - 16}px, ${ty - 16}px) scale(0.3)`,
          opacity: 0.4,
        },
      ],
      {
        duration: 500,
        delay: i * 70,
        // Accelerating ease-in: the tile is "thrown" and gains speed.
        easing: "cubic-bezier(0.55, -0.1, 0.75, 0.5)",
        fill: "both",
      },
    );
    const done = () => {
      el.remove();
      landed++;
      if (landed === chips.length) {
        fab.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.12)" },
            { transform: "scale(1)" },
          ],
          {
            duration: 240,
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
