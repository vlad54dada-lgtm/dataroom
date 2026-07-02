"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. Both icons are always rendered (no hydration flicker);
 * switching cross-rotates them — the sun sets, the moon rises.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      className="text-muted-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="relative flex size-4 items-center justify-center">
        <Sun className="absolute size-4 scale-100 rotate-0 opacity-100 transition-[transform,opacity] duration-300 ease-out-strong motion-reduce:transition-none dark:scale-50 dark:-rotate-90 dark:opacity-0" />
        <Moon className="absolute size-4 scale-50 rotate-90 opacity-0 transition-[transform,opacity] duration-300 ease-out-strong motion-reduce:transition-none dark:scale-100 dark:rotate-0 dark:opacity-100" />
      </span>
    </Button>
  );
}
