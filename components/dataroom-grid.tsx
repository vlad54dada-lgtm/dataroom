"use client";

import { useState } from "react";
import type { Node } from "@/types";
import {
  DataroomCard,
  type DataroomListItem,
} from "@/components/dataroom-card";

interface DataroomGridProps {
  items: DataroomListItem[];
  onEdit: (room: Node, trigger: HTMLElement | null) => void;
  onDelete: (room: Node, trigger: HTMLElement | null) => void;
  /** Trash-stack items dropped on a card restore into that room. */
  onDropRestore?: (ids: string[], room: Node) => void;
  /** Persist a new order after a drag-to-reorder (no-op when unchanged). */
  onReorder?: (orderedIds: string[]) => void;
}

export function DataroomGrid({
  items,
  onEdit,
  onDelete,
  onDropRestore,
  onReorder,
}: DataroomGridProps) {
  // Live order during a reorder drag; null the rest of the time so the grid
  // simply follows `items` (parent is the source of truth between drags).
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const byId = new Map(items.map((it) => [it.node.id, it]));
  const displayIds = dragOrder ?? items.map((it) => it.node.id);
  const ordered = displayIds
    .map((id) => byId.get(id))
    .filter((it): it is DataroomListItem => it !== undefined);

  const reorderable = onReorder !== undefined && items.length > 1;

  const handleStart = (id: string) => {
    setDraggingId(id);
    setDragOrder(items.map((it) => it.node.id));
  };
  const handleEnter = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setDragOrder((prev) => {
      const base = prev ?? items.map((it) => it.node.id);
      const from = base.indexOf(draggingId);
      const to = base.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return base;
      const next = [...base];
      next.splice(from, 1);
      next.splice(to, 0, draggingId);
      return next;
    });
  };
  const handleEnd = () => {
    const final = dragOrder;
    setDraggingId(null);
    setDragOrder(null);
    if (!final) return;
    const original = items.map((it) => it.node.id);
    if (
      final.length === original.length &&
      final.some((id, i) => id !== original[i])
    ) {
      onReorder?.(final);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((item, i) => (
        <DataroomCard
          key={item.node.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onDropRestore={onDropRestore}
          onReorderStart={reorderable ? handleStart : undefined}
          onReorderEnter={reorderable ? handleEnter : undefined}
          onReorderEnd={reorderable ? handleEnd : undefined}
          isDragSource={draggingId === item.node.id}
          // Staggered entrance, capped so late rows never feel held back.
          // Suppressed during a reorder drag so swapped cards don't replay it.
          className={
            dragOrder
              ? undefined
              : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out-strong motion-safe:fill-mode-backwards"
          }
          style={dragOrder ? undefined : { animationDelay: `${Math.min(i, 8) * 45}ms` }}
        />
      ))}
    </div>
  );
}
