"use client";

import { useState } from "react";
import type { Node } from "@/types";
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
              <TableHead className="w-full px-1 text-xs text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="hidden w-28 px-4 text-right text-xs text-muted-foreground md:table-cell">
                Size
              </TableHead>
              <TableHead className="hidden w-44 px-4 text-xs text-muted-foreground md:table-cell">
                Last modified
              </TableHead>
              <TableHead className="w-12 px-2">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((node) => (
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
      {selectionActive && (
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
      )}
    </>
  );
}
