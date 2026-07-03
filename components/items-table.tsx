"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
/** Lifted to the page so the choice survives folder navigation. */
export type ItemsSort = { key: SortKey; dir: SortDir } | null;

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
          // The ledger register: 11px tracked caps separate the table's
          // chrome from its data and make row content read calmer.
          "inline-flex items-center gap-1 rounded-sm text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground transition-colors duration-150 outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
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
  /** Column sort state, held by the page so navigation keeps it. */
  sort: ItemsSort;
  onSortChange: (sort: ItemsSort) => void;
  hrefFor: (id: string) => string;
  onOpenFile: (node: Node, trigger: HTMLElement | null) => void;
  onRename: (node: Node, trigger: HTMLElement | null) => void;
  onDelete: (node: Node, trigger: HTMLElement | null) => void;
  /** Single-item actions surfaced in the kebab and context menu. */
  onDownloadNode?: (node: Node) => void;
  onMoveNode?: (node: Node) => void;
  /** Warms a folder's contents cache on row hover. */
  onPrefetch?: (id: string) => void;
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
  sort,
  onSortChange,
  hrefFor,
  onOpenFile,
  onRename,
  onDelete,
  onDownloadNode,
  onMoveNode,
  onPrefetch,
  onBulkTrash,
  onBulkDownload,
  onBulkMove,
  onDropNodes,
}: ItemsTableProps) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const cycleSort = (key: SortKey) =>
    onSortChange(
      sort?.key !== key
        ? { key, dir: "asc" }
        : sort.dir === "asc"
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

  // Anchor for shift-click ranges: the last row toggled without shift.
  const anchorRef = useRef<string | null>(null);
  const toggle = (node: Node, range: boolean) => {
    if (range && anchorRef.current && anchorRef.current !== node.id) {
      // Select the whole stretch in DISPLAYED order (Drive behavior).
      const ids = sorted.map((n) => n.id);
      const a = ids.indexOf(anchorRef.current);
      const b = ids.indexOf(node.id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        });
        return; // the anchor holds, so ranges can be extended again
      }
    }
    anchorRef.current = node.id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const clear = () => setSelectedIds(new Set());

  // Page-level keyboard: Ctrl/Cmd+A selects the whole folder, Escape drops
  // the selection. Skipped while typing or while any overlay is open. No
  // deps: re-subscribed each render so the handlers always see fresh state.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      // Only OPEN layers block the shortcuts — a menu mid-exit-animation
      // still sits in the DOM with data-state="closed".
      const layerOpen = document.querySelector(
        '[data-slot="dialog-content"][data-state="open"], [data-slot="alert-dialog-content"][data-state="open"], [role="menu"][data-state="open"]',
      );
      if (typing || layerOpen) return;
      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSelectedIds(new Set(items.map((i) => i.id)));
      } else if (e.key === "Escape" && selectionActive) {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  // Clicking empty canvas (outside the table and any control) clears the
  // selection — the Drive gesture for "never mind".
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!selectionActive) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          "table, a, button, input, [role='checkbox'], [role='menu'], [data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-sonner-toast], .pointer-events-auto",
        )
      )
        return;
      clear();
    };
    window.addEventListener("click", handle);
    return () => window.removeEventListener("click", handle);
  });

  // List keyboard model, Drive-style: arrows walk rows, F2 renames, Delete
  // trashes (the selection if one exists, else the focused row), Space
  // toggles selection. Handlers bubble up from each row's primary control.
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("tr[data-node-id]");
    if (!row) return;
    const node = sorted.find((n) => n.id === row.getAttribute("data-node-id"));
    if (!node) return;
    const rows = Array.from(
      row.parentElement?.querySelectorAll<HTMLElement>("tr[data-node-id]") ??
        [],
    );
    const index = rows.indexOf(row);
    const primaryOf = (el?: HTMLElement) =>
      el?.querySelector<HTMLElement>("[data-row-primary]");
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        primaryOf(rows[Math.min(index + 1, rows.length - 1)])?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        primaryOf(rows[Math.max(index - 1, 0)])?.focus();
        break;
      case "Home":
        e.preventDefault();
        primaryOf(rows[0])?.focus();
        break;
      case "End":
        e.preventDefault();
        primaryOf(rows[rows.length - 1])?.focus();
        break;
      case "F2":
        e.preventDefault();
        onRename(node, target);
        break;
      case " ":
        if (target.hasAttribute("data-row-primary")) {
          e.preventDefault(); // Space selects; Enter still opens
          toggle(node, false);
        }
        break;
      case "Delete": {
        e.preventDefault();
        // Keep the keyboard in the list: focus the neighbor before rows move.
        const neighbor =
          primaryOf(rows[index + 1]) ?? primaryOf(rows[index - 1]);
        if (selectionActive) {
          onBulkTrash(liveSelected);
          clear();
        } else {
          onDelete(node, null);
        }
        setTimeout(() => {
          if (neighbor?.isConnected) neighbor.focus();
        }, 0);
        break;
      }
    }
  };

  return (
    <>
      <div
        className="overflow-hidden rounded-card border bg-card"
        onKeyDown={handleListKeyDown}
      >
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
                onDownload={onDownloadNode}
                onMove={onMoveNode}
                onPrefetch={onPrefetch}
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
