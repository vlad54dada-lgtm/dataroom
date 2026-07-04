"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Node } from "@/types";
import { listChildren, moveNodes } from "@/lib/storage";
import { MOVE_MIME, readIds } from "@/lib/dnd";
import {
  prefetchAsync,
  revalidateAsync,
  useAsync,
} from "@/lib/hooks/use-async";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RoomAvatar } from "@/components/room-avatar";

const COLLAPSE_KEY = "room-rail-collapsed";

/** One rail room: a nav link that doubles as a move-drop target. */
function RailItem({
  room,
  active,
  collapsed,
  onDropNodes,
}: {
  room: Node;
  active: boolean;
  collapsed: boolean;
  onDropNodes?: (ids: string[], target: Node) => void;
}) {
  const [dropReady, setDropReady] = useState(false);
  // Warm both caches the room view reads on arrival — the crumbs chain
  // (we already hold the room node, zero requests) and the root listing —
  // so a first visit lands without a skeleton.
  const prefetch = () => {
    prefetchAsync(`${room.id}:${room.id}`, async () => [room]);
    prefetchAsync(room.id, () => listChildren(room.id));
  };
  const link = (
    <Link
      href={`/room/${room.id}`}
      aria-current={active ? "page" : undefined}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onDragOver={(e) => {
        if (!onDropNodes || !e.dataTransfer.types.includes(MOVE_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropReady(true);
      }}
      onDragLeave={() => setDropReady(false)}
      onDrop={(e) => {
        setDropReady(false);
        if (!onDropNodes) return;
        const ids = readIds(e.dataTransfer, MOVE_MIME);
        if (ids.length === 0) return;
        e.preventDefault();
        onDropNodes(ids, room);
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
        collapsed && "justify-center px-0",
        active
          ? "bg-selected font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        // Dashed brand outline — the one drop-target language everywhere;
        // negative offset keeps it inside the scroll container's clip.
        dropReady &&
          "bg-folder-bg text-brand outline-2 outline-dashed -outline-offset-2 outline-brand",
      )}
    >
      <RoomAvatar
        icon={room.icon}
        color={room.color}
        size="xs"
        className="pointer-events-none shrink-0"
      />
      {!collapsed && (
        <span
          className="pointer-events-none min-w-0 truncate text-sm"
          title={room.name}
        >
          {room.name}
        </span>
      )}
    </Link>
  );
  // Collapsed strip: the name lives in a tooltip instead.
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{room.name}</TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

/**
 * Persistent dataroom rail in the room view (lg+ screens): every room one
 * click away without a detour through home, and a drop target — table rows
 * dragged onto a rail room move to that room's root. Collapses to an icon
 * strip (remembered per browser); the list scrolls under soft fade masks.
 * Hidden below lg — the mobile flow is untouched.
 */
export function RoomRail() {
  const { id: currentId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  // Distinct cache key from home's "datarooms" (different data shape).
  const { state } = useAsync(() => listChildren(null), "rail:datarooms");
  const rooms: Node[] = state.status === "success" ? state.data : [];

  // The rail lives in the layout (it persists across room switches), so it
  // owns its drop handling: move, toast with Undo, then revalidate every
  // mounted list so the page the rows came from updates too.
  const onDropNodes = async (ids: string[], target: Node) => {
    const sourceId = searchParams.get("folder") ?? currentId;
    if (target.id === sourceId) return;
    try {
      const moved = await moveNodes(ids, target.id);
      if (moved === 0) return;
      revalidateAsync();
      toast.success(
        moved === 1
          ? `Moved to ${target.name}`
          : `${moved} items moved to ${target.name}`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              void moveNodes(ids, sourceId)
                .then(() => revalidateAsync())
                .catch(() => toast.error("Couldn't undo the move"));
            },
          },
        },
      );
    } catch (err) {
      toast.error(
        err instanceof Error && /own subfolders/.test(err.message)
          ? err.message
          : "Couldn't move the items",
      );
    }
  };

  // Expanded on the server render; the stored preference applies on mount
  // (avoids a hydration mismatch — worst case a one-frame expanded flash).
  // rAF keeps the setState out of the effect's synchronous pass.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) !== "1") return;
    const raf = requestAnimationFrame(() => setCollapsed(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  };

  // Soft fade at the list's edges — only where there is actually more to
  // scroll to, so a short list stays perfectly crisp.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setFade({
      top: el.scrollTop > 4,
      bottom: el.scrollHeight - el.scrollTop - el.clientHeight > 4,
    });
  }, []);
  useEffect(() => {
    measure();
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, rooms.length, collapsed]);

  const maskImage =
    fade.top && fade.bottom
      ? "linear-gradient(to bottom, transparent, black 28px, black calc(100% - 36px), transparent)"
      : fade.top
        ? "linear-gradient(to bottom, transparent, black 28px)"
        : fade.bottom
          ? "linear-gradient(to bottom, black calc(100% - 36px), transparent)"
          : undefined;

  return (
    <nav
      aria-label="Datarooms"
      className={cn(
        // Sticky under the 56px header; its own scroll region so the rail
        // never scrolls away with the table.
        "sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] shrink-0 flex-col self-start overflow-hidden py-8 pr-5 transition-[width] duration-200 ease-out-strong motion-reduce:transition-none lg:flex",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      {/* h-8 mirrors the content column's breadcrumb row so the rail's
          first line and the page title sit on one baseline. */}
      <div
        className={cn(
          "flex h-8 items-center pb-1",
          collapsed ? "justify-center" : "justify-between pl-2",
        )}
      >
        {/* The ledger register, same as table headers. */}
        {!collapsed && (
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
            Datarooms
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                collapsed ? "Expand dataroom list" : "Collapse dataroom list"
              }
              aria-expanded={!collapsed}
              className="text-muted-foreground"
              onClick={toggle}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand" : "Collapse"}
          </TooltipContent>
        </Tooltip>
      </div>
      {/* scrollbar-gutter keeps the thin scrollbar in its own reserved
          column instead of overlapping the tiles when the list overflows. */}
      <div
        ref={listRef}
        onScroll={measure}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1 [scrollbar-gutter:stable]"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        {state.status === "loading" &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              {!collapsed && <Skeleton className="h-3.5 w-28" />}
            </div>
          ))}
        {rooms.map((room) => (
          <RailItem
            key={room.id}
            room={room}
            active={room.id === currentId}
            collapsed={collapsed}
            onDropNodes={(ids, target) => void onDropNodes(ids, target)}
          />
        ))}
      </div>
    </nav>
  );
}
