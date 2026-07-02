"use client";

import { useEffect } from "react";

/**
 * Per-route document titles in a client-only SPA: browser tabs and history
 * can tell the trash from a folder. Pass null while the name is loading —
 * the previous title holds until the real one is known.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
