"use client";

import type { Node } from "@/types";
import {
  DataroomCard,
  type DataroomListItem,
} from "@/components/dataroom-card";

interface DataroomGridProps {
  items: DataroomListItem[];
  onRename: (room: Node, trigger: HTMLElement | null) => void;
  onDelete: (room: Node, trigger: HTMLElement | null) => void;
}

export function DataroomGrid({ items, onRename, onDelete }: DataroomGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <DataroomCard
          key={item.node.id}
          item={item}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
