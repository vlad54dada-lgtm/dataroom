"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
import type { Node } from "@/types";
import { formatDate } from "@/lib/utils";
import { RowMenu } from "@/components/row-menu";

export interface DataroomListItem {
  node: Node;
  itemCount: number; // direct children only
}

interface DataroomCardProps {
  item: DataroomListItem;
  onRename: (room: Node) => void;
  onDelete: (room: Node) => void;
}

/**
 * The whole card navigates via a stretched link; the kebab is a separate
 * sibling control layered above it — one primary action, no nested
 * interactive elements.
 */
export function DataroomCard({ item, onRename, onDelete }: DataroomCardProps) {
  const { node, itemCount } = item;
  return (
    <div className="group relative rounded-card border bg-card p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-folder-bg">
          <Folder className="size-5 text-folder" strokeWidth={1.75} />
        </span>
        <RowMenu
          className="relative z-10 -mt-1 -mr-1 text-muted-foreground"
          onRename={() => onRename(node)}
          onDelete={() => onDelete(node)}
        />
      </div>
      <Link
        href={`/room/${node.id}`}
        className="mt-3 block outline-none after:absolute after:inset-0 after:rounded-card"
      >
        <span className="block truncate text-sm font-medium" title={node.name}>
          {node.name}
        </span>
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {itemCount === 1 ? "1 item" : `${itemCount} items`} &middot; Created{" "}
        {formatDate(node.createdAt)}
      </p>
    </div>
  );
}
