"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Folder, Loader2, LogOut } from "lucide-react";
import type { Node } from "@/types";
import type { SharedNodeEntry } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

interface SharedNodesSectionProps {
  entries: SharedNodeEntry[];
  /** The member's own exit from a shared file/folder. */
  onLeave: (entry: SharedNodeEntry) => void;
  /** Id currently leaving (spinner on its row). */
  leavingId?: string | null;
}

/** A shared file entry rendered as the viewer's read-only Node. */
function toViewerNode(entry: SharedNodeEntry): Node {
  return {
    id: entry.id,
    parentId: null,
    type: "file",
    name: entry.name,
    createdAt: 0,
    updatedAt: 0,
    size: entry.size ?? 0,
    blobKey: entry.blobKey ?? undefined,
  };
}

/**
 * Files & folders shared directly with the caller (top-most grants). A folder
 * opens the subtree-scoped room view; a file opens the viewer in place. Shared
 * between the home grid and the /access panel.
 */
export function SharedNodesSection({
  entries,
  onLeave,
  leavingId,
}: SharedNodesSectionProps) {
  const [viewerFile, setViewerFile] = useState<Node | null>(null);
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);

  return (
    <div className="overflow-hidden rounded-card border bg-card">
      <ul className="divide-y">
        {entries.map((entry) => {
          const isFolder = entry.type === "folder";
          const inner = (
            <>
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-tile ring-1 ring-inset ${
                  isFolder
                    ? "bg-folder-bg ring-folder/15"
                    : "bg-file-bg ring-file/15"
                }`}
              >
                {isFolder ? (
                  <Folder
                    className="size-5 fill-folder/10 text-folder"
                    strokeWidth={1.75}
                  />
                ) : (
                  <FileText
                    className="size-5 fill-file/10 text-file"
                    strokeWidth={1.75}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={entry.name}>
                  {entry.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  in {entry.roomName}
                </span>
              </span>
            </>
          );
          const openClass =
            "flex h-14 min-w-0 flex-1 items-center gap-3 rounded-sm px-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-inset";
          return (
            <li key={entry.id} className="flex items-center gap-1 pr-2">
              {isFolder ? (
                <Link
                  href={`/room/${entry.roomId}?folder=${entry.id}`}
                  className={`${openClass} hover:bg-muted/60`}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    setReturnTo(e.currentTarget);
                    setViewerFile(toViewerNode(entry));
                  }}
                  className={`${openClass} hover:bg-muted/60`}
                >
                  {inner}
                </button>
              )}
              <span className="shrink-0 rounded-full bg-folder-bg px-2 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/15 ring-inset">
                {entry.role === "editor" ? "Editor" : "Viewer"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={leavingId != null}
                onClick={() => onLeave(entry)}
              >
                {leavingId === entry.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <LogOut />
                )}
                Leave
              </Button>
            </li>
          );
        })}
      </ul>

      <PdfViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
        returnFocusTo={returnTo}
      />
    </div>
  );
}
