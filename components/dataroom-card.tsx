"use client";

import Link from "next/link";
import type { Node } from "@/types";
import { formatDate } from "@/lib/utils";
import { RoomAvatar } from "@/components/room-avatar";
import { RowMenu } from "@/components/row-menu";

export interface DataroomListItem {
  node: Node;
  itemCount: number; // direct children only
}

interface DataroomCardProps {
  item: DataroomListItem;
  onEdit: (room: Node, trigger: HTMLElement | null) => void;
  onDelete: (room: Node, trigger: HTMLElement | null) => void;
}

/**
 * The whole card navigates via a stretched link; the kebab is a separate
 * sibling control layered above it — one primary action, no nested
 * interactive elements. The avatar and optional description give each room
 * its own identity at a glance.
 */
export function DataroomCard({ item, onEdit, onDelete }: DataroomCardProps) {
  const { node, itemCount } = item;
  return (
    <div className="group relative flex flex-col rounded-card border bg-card p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="flex items-start justify-between gap-2">
        <RoomAvatar icon={node.icon} color={node.color} />
        <RowMenu
          className="relative z-10 -mt-1 -mr-1 text-muted-foreground"
          renameLabel="Edit"
          onRename={(trigger) => onEdit(node, trigger)}
          onDelete={(trigger) => onDelete(node, trigger)}
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
      {node.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {node.description}
        </p>
      ) : null}
      <p className="mt-auto pt-2 text-xs text-muted-foreground">
        {itemCount === 1 ? "1 item" : `${itemCount} items`} &middot; Created{" "}
        {formatDate(node.createdAt)}
      </p>
    </div>
  );
}
