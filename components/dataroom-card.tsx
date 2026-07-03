"use client";

import { useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
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
  /** Position in the grid — drives dnd-kit's sortable ordering. */
  index: number;
  /** Turns off drag-to-reorder (single-card grid, or reorder unsupported). */
  reorderDisabled?: boolean;
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
 * interactive elements. Reordering uses a dnd-kit drag HANDLE (the grip
 * that reveals on hover): dnd-kit refuses to start a drag on top of an
 * interactive element, and the stretched <a> covers the whole card, so a
 * dedicated non-interactive handle is what lets us keep the click/cmd-click
 * link AND drag-to-reorder.
 */
export function DataroomCard({
  item,
  index,
  reorderDisabled,
  onEdit,
  onDelete,
  onDropRestore,
  className,
  style,
}: DataroomCardProps) {
  const { node, itemCount } = item;
  // A trash-stack item is hovering over this card.
  const [dropReady, setDropReady] = useState(false);
  // dnd-kit sortable: `ref` marks the element that moves, `handleRef` the
  // grip that starts the drag, `isDragSource` dims the card being moved.
  const { ref, handleRef, isDragSource } = useSortable({
    id: node.id,
    index,
    disabled: reorderDisabled,
  });
  return (
    <div
      ref={ref}
      style={style}
      data-node-id={node.id}
      data-node-kind="folder"
      onDragOver={(e) => {
        // Native HTML5 drag = a trash item being restored onto this card.
        // (dnd-kit reordering uses pointer events, a separate system.)
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
        // isolate + the wash's -z-10 keep the wash BEHIND all content: the
        // stretched link stays clickable across the whole card and the icon
        // never tints as the wash deepens.
        "group relative isolate flex flex-col rounded-card border bg-card p-4 shadow-card transition-[border-color,box-shadow,translate,scale,opacity] duration-200 ease-out-strong hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised has-[a:active]:scale-[0.98] has-[a:active]:shadow-card has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:has-[a:active]:scale-100",
        isDragSource && "opacity-40",
        dropReady &&
          "border-brand bg-folder-bg/40 outline-2 outline-offset-2 outline-brand outline-dashed",
        className,
      )}
    >
      {/* Light only: the room's identity color bleeds into the card as a
          top wash; hovering stacks a second identical layer on top, so the
          color visibly deepens instead of barely shifting. -z-10 keeps it
          behind content. In dark the wash reads as smudge, so the identity
          lives in the footer band instead (see below). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 rounded-t-[calc(var(--radius-card)-1px)] bg-gradient-to-b to-transparent dark:hidden",
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
      {/* Drag handle: a non-interactive grip (dnd-kit skips drags started on
          <a>/<button>, so it must not be one) layered above the stretched
          link, revealed on hover. touch-none lets it work on touch too. */}
      {!reorderDisabled && (
        <span
          ref={handleRef}
          aria-hidden
          className="absolute top-1.5 left-1/2 z-10 flex h-5 w-7 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-[opacity,color] duration-150 group-hover:opacity-100 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4 rotate-90" strokeWidth={2} />
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <RoomAvatar
          icon={node.icon}
          color={node.color}
          className="transition-transform duration-200 ease-out-strong group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
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
        // draggable=false so a native trash-restore drag over the link
        // never turns into a link-URL drag.
        draggable={false}
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
