/**
 * Physical "no": a quick horizontal shake on a control that rejected input.
 * WAAPI, so repeated triggers replay without class juggling; skipped
 * entirely under prefers-reduced-motion.
 */
export function shake(el: HTMLElement | null): void {
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 180, easing: "ease-out" },
  );
}
