"use client";

import { FileText, Folder, TextSearch } from "lucide-react";
import type { SearchResult } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** Client-side refinement of a search result set — the brief's "filtering". */
export interface SearchFilter {
  type: "all" | "files" | "folders";
  contentOnly: boolean;
}

export const DEFAULT_SEARCH_FILTER: SearchFilter = {
  type: "all",
  contentOnly: false,
};

export function applySearchFilter<T extends SearchResult>(
  results: T[],
  filter: SearchFilter,
): T[] {
  return results.filter(
    (r) =>
      (filter.type === "all" ||
        (filter.type === "files"
          ? r.node.type === "file"
          : r.node.type !== "file")) &&
      (!filter.contentOnly || r.contentMatch),
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/70",
        active
          ? "border-brand/30 bg-folder-bg text-brand"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

interface SearchFiltersProps {
  value: SearchFilter;
  onChange: (next: SearchFilter) => void;
  /** Hide the content-only chip when no hit in the set is a text match. */
  hasContentMatches: boolean;
  className?: string;
}

/**
 * Filter chips for a search result list: node type plus a "text matches
 * only" toggle. Active chips wear the same brand tint as the Text match
 * badge and the snippet highlight, so the whole search UI speaks one
 * language. Pure UI — filtering itself is `applySearchFilter`.
 */
export function SearchFilters({
  value,
  onChange,
  hasContentMatches,
  className,
}: SearchFiltersProps) {
  const types = [
    { key: "all", label: "All", icon: null },
    { key: "files", label: "Files", icon: FileText },
    { key: "folders", label: "Folders", icon: Folder },
  ] as const;
  return (
    <div
      role="group"
      aria-label="Filter search results"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {types.map(({ key, label, icon: Icon }) => (
        <Chip
          key={key}
          active={value.type === key}
          onClick={() => onChange({ ...value, type: key })}
        >
          {Icon && <Icon className="size-3.5" strokeWidth={2} />}
          {label}
        </Chip>
      ))}
      {hasContentMatches && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Chip
            active={value.contentOnly}
            onClick={() => onChange({ ...value, contentOnly: !value.contentOnly })}
          >
            <TextSearch className="size-3.5" strokeWidth={2} />
            Text matches only
          </Chip>
        </>
      )}
    </div>
  );
}
