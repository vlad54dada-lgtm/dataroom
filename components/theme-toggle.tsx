"use client";

import { useRef } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. Both icons are always rendered (no hydration flicker);
 * switching cross-rotates them — the sun sets, the moon rises. The theme
 * swap itself wipes in as a circle growing from this button, via the View
 * Transitions API (falls back to an instant swap where it's unsupported or
 * under reduced motion).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const startViewTransition =
      document.startViewTransition?.bind(document);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!startViewTransition || reduce) {
      setTheme(next);
      return;
    }

    // Reveal origin = this button's centre; radius = the farthest corner, so
    // the circle covers the whole viewport by the end.
    const rect = btnRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth;
    const y = rect ? rect.top + rect.height / 2 : 0;
    const r = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const root = document.documentElement;
    root.style.setProperty("--theme-x", `${x}px`);
    root.style.setProperty("--theme-y", `${y}px`);
    root.style.setProperty("--theme-r", `${r}px`);

    // flushSync so next-themes applies the class inside the transition's
    // captured "after" state, not a tick later.
    startViewTransition(() => {
      flushSync(() => setTheme(next));
    });
  };

  return (
    <Button
      ref={btnRef}
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      className="text-muted-foreground"
      onClick={toggle}
    >
      <span className="relative flex size-4 items-center justify-center">
        <Sun className="absolute size-4 scale-100 rotate-0 opacity-100 transition-[transform,opacity] duration-300 ease-out-strong motion-reduce:transition-none dark:scale-50 dark:-rotate-90 dark:opacity-0" />
        <Moon className="absolute size-4 scale-50 rotate-90 opacity-0 transition-[transform,opacity] duration-300 ease-out-strong motion-reduce:transition-none dark:scale-100 dark:rotate-0 dark:opacity-100" />
      </span>
    </Button>
  );
}
