"use client";

import { useState } from "react";
import { ChevronRight, CornerDownRight, Folder } from "lucide-react";
import type { Node } from "@/types";
import { listChildren } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoomAvatar } from "@/components/room-avatar";

interface MoveDialogProps {
  open: boolean;
  /** Ids being moved — they and their subtrees are disabled as targets. */
  movingIds: ReadonlySet<string>;
  /** "3 items" / "report.pdf" — used in the title. */
  movingLabel: string;
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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Move {movingLabel} to…</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 max-h-72 overflow-y-auto px-1">
          {rooms.state.status === "success" ? (
            rooms.state.data.length === 0 ? (
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
                    selectedId={target?.id ?? null}
                    onSelect={setTarget}
                  />
                ))}
              </ul>
            )
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!target || submitting}
            onClick={() => void handleConfirm()}
          >
            <CornerDownRight /> Move here
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
  selectedId: string | null;
  onSelect: (node: Node) => void;
}

function BranchNode({
  node,
  depth,
  movingIds,
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
  const disabled = movingIds.has(node.id);
  const selected = selectedId === node.id;
  const loaded = children.state.status === "success" ? children.state.data : [];

  return (
    <li>
      <div
        className={cn(
          "flex h-9 items-center gap-1 rounded-lg pr-2 transition-colors",
          selected ? "bg-folder-bg" : "hover:bg-muted",
          disabled && "opacity-40",
        )}
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        <button
          type="button"
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          onClick={() => setExpanded((e) => !e)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        >
          {node.type === "dataroom" ? (
            <RoomAvatar
              icon={node.icon}
              color={node.color}
              size="sm"
              className="size-6 rounded-md"
            />
          ) : (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-folder-bg">
              <Folder className="size-3.5 text-folder" strokeWidth={1.75} />
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
      {expanded && loaded.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {loaded.map((child) => (
            <BranchNode
              key={child.id}
              node={child}
              depth={depth + 1}
              movingIds={movingIds}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
