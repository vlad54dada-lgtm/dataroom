"use client";

import { useState } from "react";
import Link from "next/link";
import type { Node } from "@/types";
import { RESTORE_MIME, readIds } from "@/lib/dnd";
import { cn, formatDate } from "@/lib/utils";
import { RoomAvatar, resolveRoomColor } from "@/components/room-avatar";
import { RowMenu } from "@/components/row-menu";

export interface DataroomListItem {
  node: Node;
  itemCount: number; // direct children only
}

interface DataroomCardProps {
  item: DataroomListItem;
  onEdit: (room: Node, trigger: HTMLElement | null) => void;
  onDelete: (room: Node, trigger: HTMLElement | null) => void;
  /** Items dragged out of the trash stack and dropped here restore into this room. */
  onDropRestore?: (ids: string[], room: Node) => void;
  /** Lets the grid stagger card entrances. */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The whole card navigates via a stretched link; the kebab is a separate
 * sibling control layered above it — one primary action, no nested
 * interactive elements. The avatar and optional description give each room
 * its own identity at a glance.
 */
export function DataroomCard({
  item,
  onEdit,
  onDelete,
  onDropRestore,
  className,
  style,
}: DataroomCardProps) {
  const { node, itemCount } = item;
  // A trash-stack item is hovering over this card.
  const [dropReady, setDropReady] = useState(false);
  return (
    <div
      style={style}
      data-node-id={node.id}
      data-node-kind="folder"
      onDragOver={(e) => {
        if (!onDropRestore || !e.dataTransfer.types.includes(RESTORE_MIME))
          return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropReady(true);
      }}
      onDragLeave={() => setDropReady(false)}
      onDrop={(e) => {
        setDropReady(false);
        if (!onDropRestore) return;
        const ids = readIds(e.dataTransfer, RESTORE_MIME);
        if (ids.length === 0) return;
        e.preventDefault();
        onDropRestore(ids, node);
      }}
      className={cn(
        "group relative flex flex-col rounded-card border bg-card p-4 shadow-card transition-[border-color,box-shadow,translate,scale] duration-200 ease-out-strong hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised has-[a:active]:scale-[0.98] has-[a:active]:shadow-card has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:has-[a:active]:scale-100",
        dropReady &&
          "border-brand bg-folder-bg/40 outline-2 outline-offset-2 outline-brand outline-dashed",
        className,
      )}
    >
      {/* Light only: the room's identity color bleeds into the card as a
          top wash; hovering stacks a second identical layer on top, so the
          color visibly deepens instead of barely shifting. In dark the
          wash reads as smudge, so the identity lives in the footer band
          instead (see below). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[calc(var(--radius-card)-1px)] bg-gradient-to-b to-transparent dark:hidden",
          resolveRoomColor(node.color).wash,
        )}
      >
        <div
          className={cn(
            "absolute inset-0 rounded-t-[calc(var(--radius-card)-1px)] bg-gradient-to-b to-transparent opacity-0 transition-opacity duration-200 ease-out-strong group-hover:opacity-100 motion-reduce:transition-none",
            resolveRoomColor(node.color).wash,
          )}
        />
      </div>
      <div className="flex items-start justify-between gap-2">
        <RoomAvatar
          icon={node.icon}
          color={node.color}
          className="transition-transform duration-200 ease-out-back group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
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
        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {node.description}
        </p>
      ) : null}
      {/* Zoned footer — the same tinted meta-band the dialogs use: facts
          live on their own quiet register, content stays on the surface.
          In dark it carries the room's color (the dark counterpart of the
          light theme's top wash). */}
      <div className="mt-auto pt-4">
        <div
          className={cn(
            "-mx-4 -mb-4 rounded-b-[calc(var(--radius-card)-1px)] border-t bg-foreground/4 px-4 py-2.5",
            resolveRoomColor(node.color).band,
          )}
        >
          <p className="text-xs text-muted-foreground">
            {itemCount === 1 ? "1 item" : `${itemCount} items`}
            {" · Created "}
            {formatDate(node.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
