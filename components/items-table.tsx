"use client";

import type { Node } from "@/types";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemRow } from "@/components/item-row";

interface ItemsTableProps {
  /** Already sorted by the adapter: folders first, then files, name-asc. */
  items: Node[];
  hrefFor: (id: string) => string;
  onOpenFile: (node: Node, trigger: HTMLElement | null) => void;
  onRename: (node: Node, trigger: HTMLElement | null) => void;
  onDelete: (node: Node, trigger: HTMLElement | null) => void;
}

export function ItemsTable({
  items,
  hrefFor,
  onOpenFile,
  onRename,
  onDelete,
}: ItemsTableProps) {
  return (
    <div className="overflow-hidden rounded-card border bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-full px-4 text-xs text-muted-foreground">
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
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
