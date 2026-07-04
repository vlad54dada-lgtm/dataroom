"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/react/sortable";
import type { Node } from "@/types";
import { RESTORE_MIME, readIds } from "@/lib/dnd";
import { cn, formatDate } from "@/lib/utils";
import { RoomAvatar } from "@/components/room-avatar";
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
}

/**
 * The whole card is grabbable: pointer-drag it (past the grid's 8px
 * threshold) to reorder, or click/Enter to open the room. Navigation is a
 * click handler rather than a stretched <a> because dnd-kit refuses to start
 * a drag on an interactive element — so making the ENTIRE card draggable
 * means it can't itself be a link. The kebab is a separate control above it.
 */
export function DataroomCard({
  item,
  index,
  reorderDisabled,
  onEdit,
  onDelete,
  onDropRestore,
}: DataroomCardProps) {
  const { node, itemCount } = item;
  const router = useRouter();
  const href = `/room/${node.id}`;
  // A trash-stack item is hovering over this card.
  const [dropReady, setDropReady] = useState(false);
  // dnd-kit sortable: `ref` on the element that moves; `isDragSource` marks
  // the card being carried, so we lift it instead of dimming it.
  const { ref, isDragSource } = useSortable({
    id: node.id,
    index,
    disabled: reorderDisabled,
  });
  // dnd-kit stamps a drag-disabled sortable aria-disabled="true" — but this
  // element is a LINK, and "reorder is off" doesn't disable it: screen
  // readers would announce it disabled (and Playwright refuses to click).
  // dnd-kit re-applies attributes on its own scheduler, so a one-shot
  // removal loses the race — the observer strips it on every re-stamp.
  useEffect(() => {
    const el = document.querySelector(
      `[data-node-id="${node.id}"][role="link"]`,
    );
    if (!el) return;
    const strip = () => {
      if (el.getAttribute("aria-disabled") === "true")
        el.removeAttribute("aria-disabled");
    };
    strip();
    const observer = new MutationObserver(strip);
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["aria-disabled"],
    });
    return () => observer.disconnect();
  }, [node.id]);
  return (
    <div
      ref={ref}
      data-node-id={node.id}
      data-node-kind="folder"
      role="link"
      tabIndex={0}
      aria-label={node.name}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // The kebab's Radix menu is PORTALED (its DOM lives on <body>) but
        // stays a React child, so menu-item clicks bubble here via React —
        // ignore anything whose real DOM node isn't inside the card. Also
        // ignore the kebab button itself. A drag suppresses the click.
        if (!e.currentTarget.contains(target)) return;
        if (target.closest("button")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        // Enter opens; Space is left to dnd-kit's keyboard sorting.
        if (e.key === "Enter") {
          e.preventDefault();
          router.push(href);
        }
      }}
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
        // `transform` is in the transition list so the OTHER cards glide
        // when dnd-kit shifts them via transform during a reorder (without
        // it they snap). The actively dragged card is exempt — dnd-kit
        // overrides its transition so it tracks the cursor 1:1.
        "group relative isolate flex cursor-pointer flex-col rounded-card border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow,transform,translate,scale,rotate] duration-200 ease-out-strong hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        // Grab cursor only once a real drag begins (isDragSource, after the
        // 8px threshold) — never a flash on a plain click.
        // 3D lift while carried: a gentle scale + tilt (Tailwind v4 sets the
        // CSS `scale`/`rotate` properties, which compose with dnd-kit's
        // transform-based translate) + the deepest elevation shadow, raised
        // above the grid. Kept subtle so the un-lift on drop doesn't snap.
        // Press feedback only when NOT being dragged — and only when the
        // press lands on the card itself. Pressing the kebab makes the card
        // `:active` too (CSS :active bubbles to ancestors), so without the
        // `has-[button:active]` reset the card would jerk down on a kebab
        // click. The reset out-specifies the `active:` rules, so it wins.
        // The press itself is a whisper (1% settle, shadow untouched):
        // scale 0.98 + a simultaneous shadow swap read as a bounce, wrong
        // register for a deal room.
        isDragSource
          ? "z-50 scale-[1.02] rotate-1 cursor-grabbing border-line-strong shadow-overlay"
          : "active:scale-[0.99] has-[button:active]:scale-100 motion-reduce:active:scale-100",
        dropReady &&
          "border-brand bg-folder-bg/40 outline-2 outline-offset-2 outline-brand outline-dashed",
      )}
    >
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
      {/* One size + one weight step above a table-row name: with the color
          washes gone, type carries room identity on the home grid. Stays
          Geist — object names are data, not display. */}
      <span
        className="mt-3 block truncate text-[15px] font-semibold tracking-[-0.01em]"
        title={node.name}
      >
        {node.name}
      </span>
      {/* Fixed two-line slot whether or not a description exists: the grid
          stretches cards to the tallest sibling, and a conditional slot left
          description-less cards with a dead void above the footer. */}
      <p
        className="mt-1 h-10 line-clamp-2 text-sm leading-5 text-muted-foreground"
        title={node.description ?? undefined}
      >
        {node.description}
      </p>
      {/* Zoned footer — the same tinted meta-band the dialogs use: facts
          live on their own quiet register, content stays on the surface.
          Room identity stays in the avatar tile; the band is neutral in
          both themes. */}
      <div className="mt-auto pt-4">
        <div className="-mx-4 -mb-4 rounded-b-[calc(var(--radius-card)-1px)] border-t bg-foreground/4 px-4 py-2.5">
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
