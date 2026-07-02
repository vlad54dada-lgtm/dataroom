"use client";

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
}

export function DataroomGrid({
  items,
  onEdit,
  onDelete,
  onDropRestore,
}: DataroomGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => (
        <DataroomCard
          key={item.node.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onDropRestore={onDropRestore}
          // Staggered entrance, capped so late rows never feel held back.
          className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out-strong motion-safe:fill-mode-backwards"
          style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
        />
      ))}
    </div>
  );
}
