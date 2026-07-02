"use client";

import { useMemo, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { Node } from "@/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemRow } from "@/components/item-row";
import { SelectionBar } from "@/components/selection-bar";

type SortKey = "name" | "size" | "modified";
type SortDir = "asc" | "desc";

/**
 * Clickable column header. Each click cycles asc → desc → back to the
 * adapter's default order; the arrow fades in for the active column and
 * rotates when the direction flips.
 */
function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <TableHead
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors duration-150 outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          active && "text-foreground",
        )}
      >
        {label}
        <ArrowUp
          aria-hidden
          className={cn(
            "size-3 shrink-0 transition-[opacity,rotate] duration-200 ease-out-strong motion-reduce:transition-none",
            active ? "opacity-100" : "opacity-0",
            active && sort.dir === "desc" && "rotate-180",
          )}
        />
      </button>
    </TableHead>
  );
}

interface ItemsTableProps {
  /** Already sorted by the adapter: folders first, then files, name-asc. */
  items: Node[];
  hrefFor: (id: string) => string;
  onOpenFile: (node: Node, trigger: HTMLElement | null) => void;
  onRename: (node: Node, trigger: HTMLElement | null) => void;
  onDelete: (node: Node, trigger: HTMLElement | null) => void;
  /** Bulk actions for the selection bar. */
  onBulkTrash: (nodes: Node[]) => void;
  onBulkDownload: (files: Node[]) => void;
  /** Opens the destination picker for the given nodes. */
  onBulkMove: (nodes: Node[]) => void;
  /** Ids dropped onto a folder row (drag-and-drop move). */
  onDropNodes: (ids: string[], target: Node) => void;
}

/**
 * Drive-style list with multi-select: checkboxes appear on hover (and stay
 * once a selection exists), the header checkbox selects the whole folder,
 * and a floating bar carries the bulk actions. Selection state lives here —
 * parents remount the table per folder (key), so navigation clears it.
 */
export function ItemsTable({
  items,
  hrefFor,
  onOpenFile,
  onRename,
  onDelete,
  onBulkTrash,
  onBulkDownload,
  onBulkMove,
  onDropNodes,
}: ItemsTableProps) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // null = the adapter's default order (folders first, name asc).
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const cycleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  // Folders stay grouped on top in every mode (Drive behavior); only the
  // order inside each group follows the active column.
  const sorted = useMemo(() => {
    if (!sort) return items;
    const dir = sort.dir === "asc" ? 1 : -1;
    const byName = (a: Node, b: Node) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    return [...items].sort((a, b) => {
      const aFolder = a.type !== "file";
      const bFolder = b.type !== "file";
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      let cmp = 0;
      if (sort.key === "name") cmp = byName(a, b);
      else if (sort.key === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
      else cmp = a.updatedAt - b.updatedAt;
      return cmp !== 0 ? cmp * dir : byName(a, b);
    });
  }, [items, sort]);
  // Drop ids that no longer exist (row trashed/renamed away underneath us).
  const liveSelected = items.filter((i) => selectedIds.has(i.id));
  const selectionActive = liveSelected.length > 0;
  const allSelected = selectionActive && liveSelected.length === items.length;

  const toggle = (node: Node) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const clear = () => setSelectedIds(new Set());

  return (
    <>
      <div className="overflow-hidden rounded-card border bg-card">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={
                    allSelected ? true : selectionActive ? "indeterminate" : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label={
                    allSelected ? "Clear selection" : "Select all items"
                  }
                />
              </TableHead>
              <SortableHead
                label="Name"
                sortKey="name"
                sort={sort}
                onSort={cycleSort}
                className="w-full px-1"
              />
              <SortableHead
                label="Size"
                sortKey="size"
                sort={sort}
                onSort={cycleSort}
                className="hidden w-28 px-4 text-right md:table-cell"
              />
              <SortableHead
                label="Last modified"
                sortKey="modified"
                sort={sort}
                onSort={cycleSort}
                className="hidden w-44 px-4 md:table-cell"
              />
              <TableHead className="w-12 px-2">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((node) => (
              <ItemRow
                key={node.id}
                node={node}
                hrefFor={hrefFor}
                onOpenFile={onOpenFile}
                onRename={onRename}
                onDelete={onDelete}
                selected={selectedIds.has(node.id)}
                selectionActive={selectionActive}
                onToggleSelect={toggle}
                getDragIds={(n) =>
                  selectedIds.has(n.id)
                    ? liveSelected.map((s) => s.id)
                    : [n.id]
                }
                onDropNodes={(ids, target) => {
                  onDropNodes(ids, target);
                  clear();
                }}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      {/* Always rendered: the bar mounts/unmounts itself so its exit
          animation can play after the selection clears. */}
      <SelectionBar
        count={liveSelected.length}
        fileCount={liveSelected.filter((n) => n.type === "file").length}
        onDownload={() => {
          onBulkDownload(liveSelected.filter((n) => n.type === "file"));
        }}
        onMove={() => onBulkMove(liveSelected)}
        onTrash={() => {
          onBulkTrash(liveSelected);
          clear();
        }}
        onClear={clear}
      />
    </>
  );
}
