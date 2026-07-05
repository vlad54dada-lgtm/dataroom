"use client";

import { useState } from "react";
import { ChevronRight, CornerDownRight, Folder, Loader2 } from "lucide-react";
import type { Node } from "@/types";
import { listChildren } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RoomAvatar } from "@/components/room-avatar";

interface MoveDialogProps {
  open: boolean;
  /** Ids being moved — they and their subtrees are disabled as targets. */
  movingIds: ReadonlySet<string>;
  /** "3 items" / "report.pdf" — used in the title. */
  movingLabel: string;
  /** Where the items already live — picking it again is a no-op, so it's disabled. */
  currentLocationId?: string;
  onConfirm: (target: Node) => Promise<void>;
  onClose: () => void;
}

/**
 * Destination picker: every dataroom at the top level, folders expand
 * lazily underneath. Any room or folder can be the target, including a
 * different dataroom. Nodes being moved are disabled to prevent cycles
 * (the adapter re-checks descendants server-side).
 */
export function MoveDialog({
  open,
  movingIds,
  movingLabel,
  currentLocationId,
  onConfirm,
  onClose,
}: MoveDialogProps) {
  const rooms = useAsync(() => listChildren(null), "move-dialog-rooms");
  const [target, setTarget] = useState<Node | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await onConfirm(target);
      onClose();
    } catch {
      // Surfaced via the caller's toast; keep the dialog open.
      setSubmitting(false);
    }
  };

  return (
    // Closing is blocked while the move is in flight (Esc/overlay/X).
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Move {movingLabel} to…</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a destination dataroom or folder, then confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 max-h-72 overflow-y-auto px-1">
          {rooms.state.status === "loading" && (
            <div className="flex flex-col gap-1 py-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          )}
          {rooms.state.status === "error" && (
            <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load destinations.
              </p>
              <Button variant="outline" size="sm" onClick={rooms.reload}>
                Try again
              </Button>
            </div>
          )}
          {rooms.state.status === "success" &&
            (rooms.state.data.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No destinations yet
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {rooms.state.data.map((room) => (
                  <BranchNode
                    key={room.id}
                    node={room}
                    depth={0}
                    movingIds={movingIds}
                    parentDisabled={false}
                    selectedId={target?.id ?? null}
                    onSelect={setTarget}
                  />
                ))}
              </ul>
            ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              !target || submitting || target.id === currentLocationId
            }
            title={
              target && target.id === currentLocationId
                ? "Already in this folder"
                : undefined
            }
            onClick={() => void handleConfirm()}
          >
            {submitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CornerDownRight />
            )}{" "}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BranchNodeProps {
  node: Node;
  depth: number;
  movingIds: ReadonlySet<string>;
  /** True anywhere inside a moving folder — the whole subtree is off-limits. */
  parentDisabled: boolean;
  selectedId: string | null;
  onSelect: (node: Node) => void;
}

function BranchNode({
  node,
  depth,
  movingIds,
  parentDisabled,
  selectedId,
  onSelect,
}: BranchNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const children = useAsync(
    async () =>
      expanded
        ? (await listChildren(node.id)).filter((n) => n.type === "folder")
        : [],
    expanded ? `move-children:${node.id}` : `move-children-idle:${node.id}`,
  );
  const disabled = movingIds.has(node.id) || parentDisabled;
  const selected = selectedId === node.id;
  const loaded = children.state.status === "success" ? children.state.data : [];
  const loadingChildren = expanded && children.state.status === "loading";

  return (
    <li>
      <div
        className={cn(
          "flex h-9 items-center gap-1 rounded-lg pr-2 transition-colors",
          selected ? "bg-folder-bg" : "hover:bg-accent",
          disabled && "opacity-40",
        )}
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        <button
          type="button"
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          onClick={() => setExpanded((e) => !e)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/70"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={selected}
          onClick={() => onSelect(node)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-not-allowed"
        >
          {node.type === "dataroom" ? (
            <RoomAvatar
              icon={node.icon}
              color={node.color}
              size="sm"
              className="size-6 rounded-md"
            />
          ) : (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-folder-bg ring-1 ring-folder/15 ring-inset">
              <Folder
                className="size-3.5 fill-folder/10 text-folder"
                strokeWidth={1.75}
              />
            </span>
          )}
          <span
            className={cn(
              "truncate text-sm",
              selected && "font-medium text-brand",
            )}
            title={node.name}
          >
            {node.name}
          </span>
        </button>
      </div>
      {loadingChildren && (
        <div
          className="flex h-8 items-center"
          style={{ paddingLeft: `${(depth + 1) * 20 + 32}px` }}
        >
          <Skeleton className="h-4 w-28" />
        </div>
      )}
      {expanded &&
        children.state.status === "success" &&
        loaded.length === 0 && (
          <p
            className="flex h-8 items-center text-xs text-muted-foreground"
            style={{ paddingLeft: `${(depth + 1) * 20 + 32}px` }}
          >
            No subfolders
          </p>
        )}
      {expanded && loaded.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {loaded.map((child) => (
            <BranchNode
              key={child.id}
              node={child}
              depth={depth + 1}
              movingIds={movingIds}
              parentDisabled={disabled}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
