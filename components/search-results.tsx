"use client";

import { FileText, Folder } from "lucide-react";
import type { Node } from "@/types";
import type { SearchResult } from "@/lib/storage";

interface SearchResultsProps {
  results: SearchResult[];
  onOpenFolder: (node: Node) => void;
  onOpenFile: (node: Node, trigger: HTMLElement | null) => void;
}

/**
 * Flat result list for dataroom search. Each row shows where the match
 * lives; content matches (text inside the PDF, not the name) get a quiet
 * "Text match" tag so the hit is explainable.
 */
export function SearchResults({
  results,
  onOpenFolder,
  onOpenFile,
}: SearchResultsProps) {
  return (
    <div className="divide-y overflow-hidden rounded-card border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      {results.map(({ node, parentName, contentMatch }) => {
        const isFolder = node.type !== "file";
        return (
          <button
            key={node.id}
            type="button"
            onClick={(e) =>
              isFolder ? onOpenFolder(node) : onOpenFile(node, e.currentTarget)
            }
            className="flex h-14 w-full min-w-0 items-center gap-3 px-4 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
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
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                in {parentName}
              </span>
            </span>
            {contentMatch && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                Text match
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
