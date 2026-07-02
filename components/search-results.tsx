"use client";

import { FileText, Folder, FolderOpen } from "lucide-react";
import type { Node } from "@/types";
import type { SearchResult } from "@/lib/storage";
import { Button } from "@/components/ui/button";

interface SearchResultsProps {
  results: SearchResult[];
  onOpenFolder: (node: Node) => void;
  onOpenFile: (node: Node, trigger: HTMLElement | null) => void;
  /** Jump to the folder that CONTAINS the hit (null parent = room root). */
  onOpenLocation?: (parentId: string | null) => void;
}

/**
 * ts_headline marks matched words with [[ ]]; render them as <mark> so the
 * user sees exactly WHY a document surfaced.
 */
function Snippet({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  text.split("[[").forEach((chunk, i) => {
    if (i === 0) {
      if (chunk) parts.push(chunk);
      return;
    }
    const [hit, rest] = chunk.split("]]");
    parts.push(
      <mark
        key={i}
        className="rounded-[3px] bg-folder-bg px-0.5 font-medium text-brand"
      >
        {hit}
      </mark>,
    );
    if (rest) parts.push(rest);
  });
  return <>&ldquo;…{parts}…&rdquo;</>;
}

/**
 * Flat result list for dataroom search. Each row shows where the match
 * lives; content matches (text inside the PDF, not the name) get a quiet
 * "Text match" tag plus the matched fragment, so every hit is explainable.
 */
export function SearchResults({
  results,
  onOpenFolder,
  onOpenFile,
  onOpenLocation,
}: SearchResultsProps) {
  return (
    <div className="divide-y overflow-hidden rounded-card border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      {results.map(({ node, parentName, contentMatch, snippet }) => {
        const isFolder = node.type !== "file";
        return (
          <div
            key={node.id}
            className="group/hit flex h-14 min-w-0 items-center gap-3 pr-3 pl-4 transition-colors duration-150 hover:bg-muted/50"
          >
            <button
              type="button"
              onClick={(e) =>
                isFolder
                  ? onOpenFolder(node)
                  : onOpenFile(node, e.currentTarget)
              }
              className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-tile ${
                  isFolder ? "bg-folder-bg" : "bg-file-bg"
                }`}
              >
                {isFolder ? (
                  <Folder className="size-5 text-folder" strokeWidth={1.75} />
                ) : (
                  <FileText className="size-5 text-file" strokeWidth={1.75} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm font-medium"
                  title={node.name}
                >
                  {node.name}
                  <span className="sr-only">
                    {isFolder ? ", folder" : ", PDF"}
                  </span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  in {parentName}
                  {snippet ? (
                    <>
                      {" · "}
                      <Snippet text={snippet} />
                    </>
                  ) : null}
                </span>
              </span>
            </button>
            {contentMatch && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                Text match
              </span>
            )}
            {onOpenLocation && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Open location: ${parentName}`}
                title={`Open ${parentName}`}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/hit:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onOpenLocation(node.parentId)}
              >
                <FolderOpen />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
