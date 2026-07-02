"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Node } from "@/types";
import { MOVE_MIME, readIds, startDragGhost } from "@/lib/dnd";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { RowMenu } from "@/components/row-menu";

interface ItemRowProps {
  node: Node;
  /** Folder rows navigate via a real link (cmd+click works). */
  hrefFor: (id: string) => string;
  /** File rows open the viewer; the trigger element restores focus on close. */
  onOpenFile: (node: Node, trigger: HTMLElement | null) => void;
  onRename: (node: Node, trigger: HTMLElement | null) => void;
  onDelete: (node: Node, trigger: HTMLElement | null) => void;
  /** File rows only: single-item download. */
  onDownload?: (node: Node) => void;
  /** Opens the Move to… destination picker for this single item. */
  onMove?: (node: Node) => void;
  /** Warm the folder's contents cache on hover so navigation is instant. */
  onPrefetch?: (id: string) => void;
  selected: boolean;
  /** While a selection exists, every row's checkbox stays visible. */
  selectionActive: boolean;
  /** `range` = shift-click: select the whole stretch from the anchor row. */
  onToggleSelect: (node: Node, range: boolean) => void;
  /** Which ids a drag starting on this row carries (selection-aware). */
  getDragIds: (node: Node) => string[];
  /** Ids dropped onto a folder row. */
  onDropNodes: (ids: string[], target: Node) => void;
}

/**
 * One primary interactive element per row (a link for folders, a button for
 * files) plus sibling checkbox/kebab controls — no nested interactives.
 * Clicking the rest of the row toggles selection (Drive behavior), and the
 * whole row carries a right-click context menu mirroring the kebab. Below
 * md the Size/Modified columns are REFLOWED into a secondary line under
 * the name, so the table holds together down to 375px.
 */
export function ItemRow({
  node,
  hrefFor,
  onOpenFile,
  onRename,
  onDelete,
  onDownload,
  onMove,
  onPrefetch,
  selected,
  selectionActive,
  onToggleSelect,
  getDragIds,
  onDropNodes,
}: ItemRowProps) {
  const router = useRouter();
  const isFolder = node.type !== "file";
  const size = node.type === "file" ? formatBytes(node.size ?? 0) : null;
  const modified = formatDate(node.updatedAt);
  // Folder rows light up while a compatible drag hovers over them.
  const [dropReady, setDropReady] = useState(false);
  // The source row dims while its drag is in flight.
  const [dragging, setDragging] = useState(false);

  const dropProps = isFolder
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes(MOVE_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropReady(true);
        },
        onDragLeave: () => setDropReady(false),
        onDrop: (e: React.DragEvent) => {
          setDropReady(false);
          const ids = readIds(e.dataTransfer, MOVE_MIME);
          if (ids.length === 0 || ids.includes(node.id)) return;
          e.preventDefault();
          onDropNodes(ids, node);
        },
      }
    : {};

  const nameContent = (
    <>
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
        <span className="block truncate text-sm font-medium" title={node.name}>
          {node.name}
          <span className="sr-only">{isFolder ? ", folder" : ", PDF"}</span>
        </span>
        <span className="block truncate text-xs tabular-nums text-muted-foreground md:hidden">
          {size ? `${size} · ${modified}` : modified}
        </span>
      </span>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          draggable
          data-node-id={node.id}
          data-node-kind={isFolder ? "folder" : "file"}
          onClick={(e: React.MouseEvent) => {
            // Clicking the "dead" 2/3 of the row selects it (Drive
            // behavior); real controls keep their own actions.
            const target = e.target as HTMLElement;
            if (target.closest("a, button, input, [role='checkbox']")) return;
            onToggleSelect(node, e.shiftKey);
          }}
          onDragStart={(e: React.DragEvent) => {
            const ids = getDragIds(node);
            e.dataTransfer.setData(MOVE_MIME, JSON.stringify(ids));
            e.dataTransfer.effectAllowed = "move";
            startDragGhost(
              e.dataTransfer,
              node.name,
              ids.length,
              isFolder ? "folder" : "file",
            );
            setDragging(true);
            window.dispatchEvent(
              new CustomEvent("dnd-drag", {
                detail: { kind: "move", active: true, count: ids.length },
              }),
            );
          }}
          onDragEnd={() => {
            setDragging(false);
            window.dispatchEvent(
              new CustomEvent("dnd-drag", {
                detail: { kind: "move", active: false, count: 0 },
              }),
            );
          }}
          className={cn(
            "group/row h-12 transition-opacity",
            selected && "bg-muted/50",
            dropReady && "bg-folder-bg ring-2 ring-inset ring-brand",
            dragging && "opacity-40",
          )}
          data-state={selected ? "selected" : undefined}
          {...dropProps}
        >
          <TableCell className="w-10 px-3 py-0">
            {/* Reveal on the wrapper (zoom + fade) so it never fights the
                checkbox's own press-scale transition. Always visible on
                touch — there is no hover to reveal it. */}
            <span
              className={cn(
                "flex transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                selected || selectionActive
                  ? "scale-100 opacity-100"
                  : "scale-90 opacity-0 group-hover/row:scale-100 group-hover/row:opacity-100 has-[:focus-visible]:scale-100 has-[:focus-visible]:opacity-100 pointer-coarse:scale-100 pointer-coarse:opacity-100",
              )}
            >
              <Checkbox
                checked={selected}
                onClick={(e) => {
                  if (e.shiftKey) {
                    // preventDefault stops Radix's own toggle — the range
                    // handler owns the whole selection change.
                    e.preventDefault();
                    onToggleSelect(node, true);
                  }
                }}
                onCheckedChange={() => onToggleSelect(node, false)}
                aria-label={`Select ${node.name}`}
              />
            </span>
          </TableCell>
          <TableCell className="w-full min-w-0 max-w-0 px-1 py-0">
            {isFolder ? (
              <Link
                href={hrefFor(node.id)}
                data-row-primary
                onPointerEnter={() => onPrefetch?.(node.id)}
                onFocus={() => onPrefetch?.(node.id)}
                className="flex h-12 w-full min-w-0 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {nameContent}
              </Link>
            ) : (
              <button
                type="button"
                data-row-primary
                onClick={(e) => onOpenFile(node, e.currentTarget)}
                className="flex h-12 w-full min-w-0 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {nameContent}
              </button>
            )}
          </TableCell>
          <TableCell className="hidden w-28 px-4 py-0 text-right text-sm tabular-nums text-muted-foreground md:table-cell">
            {size ?? "—"}
          </TableCell>
          <TableCell className="hidden w-44 px-4 py-0 text-sm tabular-nums text-muted-foreground md:table-cell">
            {modified}
          </TableCell>
          <TableCell className="w-12 px-2 py-0 text-right">
            <RowMenu
              className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
              subject={node.name}
              onRename={(trigger) => onRename(node, trigger)}
              onDelete={(trigger) => onDelete(node, trigger)}
              onDownload={
                !isFolder && onDownload ? () => onDownload(node) : undefined
              }
              onMove={onMove ? () => onMove(node) : undefined}
            />
          </TableCell>
        </TableRow>
      </ContextMenuTrigger>
      {/* Right-click mirror of the kebab — the first gesture Drive hands try. */}
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onSelect={() =>
            isFolder
              ? router.push(hrefFor(node.id))
              : onOpenFile(node, null)
          }
        >
          {isFolder ? <FolderOpen /> : <FileText />} Open
        </ContextMenuItem>
        {!isFolder && onDownload && (
          <ContextMenuItem onSelect={() => onDownload(node)}>
            <Download /> Download
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => onRename(node, null)}>
          <Pencil /> Rename
        </ContextMenuItem>
        {onMove && (
          <ContextMenuItem onSelect={() => onMove(node)}>
            <FolderInput /> Move to…
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDelete(node, null)}
        >
          <Trash2 /> Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
