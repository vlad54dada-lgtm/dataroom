"use client";

import { useEffect, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  Feedback,
  PointerSensor,
  PointerActivationConstraints,
  type Sensors,
} from "@dnd-kit/dom";
import type { Plugins } from "@dnd-kit/abstract";
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

// 'clone' feedback + an explicit drop animation: on release, a copy glides
// into the slot over ~220ms instead of the default 'move' mode snapping the
// card home instantly.
const plugins = (defaults: Plugins): Plugins => [
  ...defaults,
  Feedback.configure({
    feedback: "clone",
    dropAnimation: { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  }),
];

export function DataroomGrid({
  items,
  onEdit,
  onDelete,
  onDropRestore,
  onReorder,
}: DataroomGridProps) {
  const reorderable = onReorder !== undefined && items.length > 1;

  // The staggered entrance animation restarts whenever a card's DOM node is
  // re-inserted (which React does every time dnd-kit reorders the list) —
  // that replay is the flicker seen while dragging and on drop. So the
  // entrance runs ONCE, on the grid's first mount, then is dropped forever:
  // no class means nothing to replay when cards shuffle.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    // Longer than the last card's (delay + duration): 8*45 + 300 = 660ms.
    const t = setTimeout(() => setEntered(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <DragDropProvider
      sensors={sensors}
      plugins={plugins}
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <DataroomCard
            key={item.node.id}
            item={item}
            index={i}
            reorderDisabled={!reorderable}
            onEdit={onEdit}
            onDelete={onDelete}
            onDropRestore={onDropRestore}
            // Staggered entrance on first load only (capped so late rows
            // never feel held back); gone afterward so reorders never
            // re-fire it.
            className={
              entered
                ? undefined
                : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out-strong motion-safe:fill-mode-backwards"
            }
            style={entered ? undefined : { animationDelay: `${Math.min(i, 8) * 45}ms` }}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
