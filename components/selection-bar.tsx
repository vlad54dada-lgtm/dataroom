"use client";

import { Download, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SelectionBarProps {
  count: number;
  /** How many of the selected items are files (downloadable). */
  fileCount: number;
  onDownload: () => void;
  onTrash: () => void;
  onClear: () => void;
}

/**
 * Floating bulk-action bar, bottom center. Appears as soon as anything is
 * selected; Download covers the selected files, Move to trash covers all.
 */
export function SelectionBar({
  count,
  fileCount,
  onDownload,
  onTrash,
  onClear,
}: SelectionBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
      <div className="flex items-center gap-1 rounded-full border bg-card py-1.5 pr-1.5 pl-4 shadow-lg">
        <span className="text-sm font-medium tabular-nums">
          {count} selected
        </span>
        <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          disabled={fileCount === 0}
          onClick={onDownload}
        >
          <Download />
          {fileCount > 0 && count !== fileCount
            ? `Download ${fileCount} ${fileCount === 1 ? "file" : "files"}`
            : "Download"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onTrash}
        >
          <Trash2 /> Move to trash
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
