"use client";

import { useEffect, type RefObject } from "react";

/**
 * "/" or Ctrl/Cmd+K focuses the page's search input — ignored while the
 * user is already typing somewhere or a dialog is open.
 */
export function useSearchHotkey(
  inputRef: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey;
      const cmdK = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
      if (!slash && !cmdK) return;
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (
        document.querySelector(
          '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]',
        )
      )
        return;
      const input = inputRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [inputRef]);
}
