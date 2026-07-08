"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  PointerSensor,
  PointerActivationConstraints,
  type Sensors,
} from "@dnd-kit/dom";
import type { Node } from "@/types";
import {
  DataroomCard,
  type DataroomListItem,
} from "@/components/dataroom-card";

interface DataroomGridProps {
  items: DataroomListItem[];
  /** Owner-only actions; absent for the "Shared with you" section. */
  onEdit?: (room: Node, trigger: HTMLElement | null) => void;
  onDelete?: (room: Node, trigger: HTMLElement | null) => void;
  onManageAccess?: (room: Node, trigger: HTMLElement | null) => void;
  /** Shared-with-me cards: the member's own exit. */
  onLeave?: (room: Node, trigger: HTMLElement | null) => void;
  /** Trash-stack items dropped on a card restore into that room. */
  onDropRestore?: (ids: string[], room: Node) => void;
  /** Persist a new order after a drag-to-reorder (no-op when unchanged). */
  onReorder?: (orderedIds: string[]) => void;
}

// A drag starts only after the pointer travels 8px, so a plain click still
// falls through to the card's stretched link (opens the room).
const sensors = (defaults: Sensors): Sensors => [
  ...defaults.filter((s) => s !== PointerSensor),
  PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Distance({ value: 8 }),
    ],
  }),
];

export function DataroomGrid({
  items,
  onEdit,
  onDelete,
  onManageAccess,
  onLeave,
  onDropRestore,
  onReorder,
}: DataroomGridProps) {
  const reorderable = onReorder !== undefined && items.length > 1;

  return (
    <DragDropProvider
      sensors={sensors}
      onDragEnd={(event) => {
        if (event.canceled) return;
        const { source } = event.operation;
        if (!isSortable(source)) return;
        const { initialIndex, index } = source;
        if (initialIndex === index) return;
        // dnd-kit shifted the cards optimistically during the drag; commit
        // the final order (parent persists it and re-renders in place).
        const ids = items.map((it) => it.node.id);
        const [moved] = ids.splice(initialIndex, 1);
        ids.splice(index, 0, moved);
        onReorder?.(ids);
      }}
    >
      {/* One quiet fade on the grid's first mount. The animation lives on
          this persistent container, so reorders and optimistic inserts
          can't re-fire it — no per-card stagger, no bookkeeping needed. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {items.map((item, i) => (
          <DataroomCard
            key={item.node.id}
            item={item}
            index={i}
            reorderDisabled={!reorderable}
            onEdit={onEdit}
            onDelete={onDelete}
            onManageAccess={onManageAccess}
            onLeave={onLeave}
            onDropRestore={onDropRestore}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
