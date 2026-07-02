"use client";

import { useEffect, useState } from "react";
import { Download, FolderInput, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SelectionBarProps {
  count: number;
  /** How many of the selected items are files (downloadable). */
  fileCount: number;
  onDownload: () => void;
  onMove: () => void;
  onTrash: () => void;
  onClear: () => void;
}

/** How long the exit animation holds the bar in the DOM. */
const EXIT_MS = 150;

/**
 * Floating bulk-action bar, bottom center. Rises in as soon as anything is
 * selected and sinks away when the selection clears (rendered permanently by
 * the table; mount/unmount is handled here so the exit can play). Download
 * covers the selected files, Move to trash covers all.
 */
export function SelectionBar(props: SelectionBarProps) {
  const open = props.count > 0;
  // Held past close (adjust-during-render) so the labels don't blank out
  // mid-exit — `count` drops to 0 the moment the exit starts.
  const [held, setHeld] = useState({
    count: props.count,
    fileCount: props.fileCount,
  });
  if (
    open &&
    (held.count !== props.count || held.fileCount !== props.fileCount)
  ) {
    setHeld({ count: props.count, fileCount: props.fileCount });
  }

  // Closing edge detected during render (prev-state pattern): flags the
  // exit pass; the effect just times the unmount out.
  const [prevOpen, setPrevOpen] = useState(open);
  const [exiting, setExiting] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setExiting(true);
  }
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setExiting(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open && !exiting) return null;
  const count = open ? props.count : held.count;
  const fileCount = open ? props.fileCount : held.fileCount;
  const { onDownload, onMove, onTrash, onClear } = props;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-1 rounded-full border bg-card py-1.5 pr-1.5 pl-4 shadow-lg",
          open
            ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 motion-safe:ease-out-back"
            : "pointer-events-none motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-95 motion-safe:slide-out-to-bottom-2 motion-safe:duration-150 motion-safe:fill-mode-forwards",
        )}
      >
        {/* The keyed span remounts per count (the tick animation), so a
            persistent sr-only twin does the live announcing. */}
        <span role="status" aria-live="polite" className="sr-only">
          {count} selected
        </span>
        <span
          key={count}
          aria-hidden
          className="text-sm font-medium tabular-nums motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
        >
          {count} selected
        </span>
        <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
        {/* Labels collapse to icons below sm so the bar fits a 375px
            viewport; the text stays for screen readers. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={fileCount === 0}
          onClick={onDownload}
        >
          <Download />
          <span className="max-sm:sr-only">
            {fileCount > 0 && count !== fileCount
              ? `Download ${fileCount} ${fileCount === 1 ? "file" : "files"}`
              : "Download"}
          </span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onMove}>
          <FolderInput /> <span className="max-sm:sr-only">Move to…</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onTrash}
        >
          <Trash2 /> <span className="max-sm:sr-only">Move to trash</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          className="text-muted-foreground"
          onClick={onClear}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
