"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  FileUp,
  Folder,
  FolderInput,
  FolderOpen,
  Globe,
  History,
  Link2,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import type { Node } from "@/types";
import { MOVE_MIME, readIds, startDragGhost } from "@/lib/dnd";
import { cn, formatBytes, formatDateTime, formatModified } from "@/lib/utils";
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
  /** Optional: viewers see no mutating controls at all. */
  onRename?: (node: Node, trigger: HTMLElement | null) => void;
  onDelete?: (node: Node, trigger: HTMLElement | null) => void;
  /** File rows only: single-item download. */
  onDownload?: (node: Node) => void;
  /** File rows only: replace content as a new version (keeps name/id). */
  onUploadVersion?: (node: Node) => void;
  /** File rows only: opens the version history dialog. */
  onVersionHistory?: (node: Node, trigger: HTMLElement | null) => void;
  /** File rows only: opens the share settings dialog. */
  onShare?: (node: Node, trigger: HTMLElement | null) => void;
  /** Opens the Move to… destination picker for this single item. */
  onMove?: (node: Node) => void;
  /** Warm the folder's contents cache on hover so navigation is instant. */
  onPrefetch?: (id: string) => void;
  /** Folders: direct child count, shown where files show their size. */
  childCount?: number;
  /** This node carries an active public link — show the globe badge. */
  sharedViaLink?: boolean;
  /** This node is shared with specific people (grants) — show the people badge. */
  sharedViaPeople?: boolean;
  /** Viewer mode: rows can't be dragged (no move powers). */
  disableDrag?: boolean;
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
  onUploadVersion,
  onVersionHistory,
  onShare,
  onMove,
  onPrefetch,
  childCount,
  sharedViaLink,
  sharedViaPeople,
  disableDrag,
  selected,
  selectionActive,
  onToggleSelect,
  getDragIds,
  onDropNodes,
}: ItemRowProps) {
  const router = useRouter();
  const isFolder = node.type !== "file";
  const size = node.type === "file" ? formatBytes(node.size ?? 0) : null;
  // Folders show what files show in Size: how much is in there. One count
  // series (0 items / 1 item / N items) — a word like "Empty" breaks the
  // ledger column.
  const contents =
    isFolder && childCount !== undefined
      ? childCount === 1
        ? "1 item"
        : `${childCount} items`
      : null;
  const modified = formatModified(node.updatedAt);
  // Folder rows light up while a compatible drag hovers over them.
  const [dropReady, setDropReady] = useState(false);
  // The source row dims while its drag is in flight.
  const [dragging, setDragging] = useState(false);

  const dropProps = isFolder && !disableDrag
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
        className={`flex size-8 shrink-0 items-center justify-center rounded-tile ring-1 ring-inset ${
          isFolder ? "bg-folder-bg ring-folder/15" : "bg-file-bg ring-file/15"
        }`}
      >
        {isFolder ? (
          <Folder className="size-5 fill-folder/10 text-folder" strokeWidth={1.75} />
        ) : (
          <FileText className="size-5 fill-file/10 text-file" strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className="block min-w-0 truncate text-sm font-medium"
            title={node.name}
          >
            {node.name}
            <span className="sr-only">{isFolder ? ", folder" : ", PDF"}</span>
          </span>
          {/* Two distinct share signals: a navy globe = a public link
              (anyone with it), a slate people icon = invited by email. Both
              can be present. Icon-only keeps the ledger row dense; the meaning
              lives in the tooltip + sr-only label. */}
          {(sharedViaLink || sharedViaPeople) && (
            <span className="flex shrink-0 items-center gap-1">
              {sharedViaLink && (
                <span
                  title="Public link — anyone with the link can open it"
                  className="flex size-5 items-center justify-center rounded-full bg-folder-bg text-brand ring-1 ring-brand/25 ring-inset"
                >
                  <Globe className="size-3.5" strokeWidth={2} aria-hidden />
                  <span className="sr-only">Public link</span>
                </span>
              )}
              {sharedViaPeople && (
                <span
                  title="Shared with specific people"
                  className="flex size-5 items-center justify-center rounded-full bg-file-bg text-file ring-1 ring-file/25 ring-inset"
                >
                  <Users className="size-3.5" strokeWidth={2} aria-hidden />
                  <span className="sr-only">Shared with specific people</span>
                </span>
              )}
            </span>
          )}
        </span>
        <span className="block truncate text-xs tabular-nums text-muted-foreground md:hidden">
          {size
            ? `${size} · ${modified}`
            : contents
              ? `${contents} · ${modified}`
              : modified}
        </span>
      </span>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          draggable={!disableDrag}
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
            // Selection is a STATE (brand wash); hover stays the gray gesture.
            selected && "bg-selected",
            // Dashed brand outline — the shared drop-target language.
            dropReady &&
              "bg-folder-bg outline-2 outline-dashed -outline-offset-2 outline-brand",
            dragging && "opacity-40",
          )}
          data-state={selected ? "selected" : undefined}
          {...dropProps}
        >
          <TableCell className="w-10 px-3 py-0">
            {/* Opacity-only reveal — no zoom. Always visible on touch —
                there is no hover to reveal it. */}
            <span
              className={cn(
                "flex transition-opacity duration-150 motion-reduce:transition-none",
                selected || selectionActive
                  ? "opacity-100"
                  : "opacity-0 group-hover/row:opacity-100 has-[:focus-visible]:opacity-100 pointer-coarse:opacity-100",
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
                className="flex h-12 w-full min-w-0 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
              >
                {nameContent}
              </Link>
            ) : (
              <button
                type="button"
                data-row-primary
                onClick={(e) => onOpenFile(node, e.currentTarget)}
                className="flex h-12 w-full min-w-0 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
              >
                {nameContent}
              </button>
            )}
          </TableCell>
          <TableCell className="hidden w-28 px-4 py-0 text-right text-sm tabular-nums text-muted-foreground md:table-cell">
            {size ?? contents ?? "—"}
          </TableCell>
          <TableCell
            className="hidden w-44 px-4 py-0 text-sm tabular-nums text-muted-foreground md:table-cell"
            title={formatDateTime(node.updatedAt)}
          >
            {modified}
          </TableCell>
          <TableCell className="w-12 px-2 py-0 text-right">
            <RowMenu
              className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
              subject={node.name}
              onRename={
                onRename ? (trigger) => onRename(node, trigger) : undefined
              }
              onDelete={
                onDelete ? (trigger) => onDelete(node, trigger) : undefined
              }
              onDownload={
                !isFolder && onDownload ? () => onDownload(node) : undefined
              }
              onUploadVersion={
                !isFolder && onUploadVersion
                  ? () => onUploadVersion(node)
                  : undefined
              }
              onVersionHistory={
                !isFolder && onVersionHistory
                  ? (trigger) => onVersionHistory(node, trigger)
                  : undefined
              }
              onShare={
                onShare ? (trigger) => onShare(node, trigger) : undefined
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
        {!isFolder && onUploadVersion && (
          <ContextMenuItem onSelect={() => onUploadVersion(node)}>
            <FileUp /> Upload new version
          </ContextMenuItem>
        )}
        {!isFolder && onVersionHistory && (
          <ContextMenuItem onSelect={() => onVersionHistory(node, null)}>
            <History /> Version history
          </ContextMenuItem>
        )}
        {onShare && (
          <ContextMenuItem onSelect={() => onShare(node, null)}>
            <Link2 /> Share
          </ContextMenuItem>
        )}
        {onRename && (
          <ContextMenuItem onSelect={() => onRename(node, null)}>
            <Pencil /> Rename
          </ContextMenuItem>
        )}
        {onMove && (
          <ContextMenuItem onSelect={() => onMove(node)}>
            <FolderInput /> Move to…
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => onDelete(node, null)}
            >
              <Trash2 /> Move to trash
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
