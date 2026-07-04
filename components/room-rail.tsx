"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Node } from "@/types";
import { listChildren } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
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

/**
 * Persistent dataroom rail in the room view (lg+ screens): every room one
 * click away without a detour through home. Collapses to an icon strip
 * (choice remembered per browser); the list scrolls under soft fade masks
 * when it outgrows the viewport. Hidden below lg — the mobile flow is
 * untouched.
 */
export function RoomRail() {
  const { id: currentId } = useParams<{ id: string }>();
  // Distinct cache key from home's "datarooms" (different data shape).
  const { state } = useAsync(() => listChildren(null), "rail:datarooms");
  const rooms: Node[] = state.status === "success" ? state.data : [];

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
        "sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] shrink-0 flex-col self-start overflow-hidden py-8 pr-6 transition-[width] duration-200 ease-out-strong motion-reduce:transition-none lg:flex",
        collapsed ? "w-[60px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center pb-2",
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
              aria-label={collapsed ? "Expand dataroom list" : "Collapse dataroom list"}
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
      <div
        ref={listRef}
        onScroll={measure}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        {state.status === "loading" &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="size-8 shrink-0 rounded-tile" />
              {!collapsed && <Skeleton className="h-3.5 w-28" />}
            </div>
          ))}
        {rooms.map((room) => {
          const active = room.id === currentId;
          const item = (
            <Link
              key={room.id}
              href={`/room/${room.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
                collapsed && "justify-center px-0",
                active
                  ? "bg-selected font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <RoomAvatar
                icon={room.icon}
                color={room.color}
                size="sm"
                className="shrink-0"
              />
              {!collapsed && (
                <span className="min-w-0 truncate text-sm" title={room.name}>
                  {room.name}
                </span>
              )}
            </Link>
          );
          // Collapsed strip: the name lives in a tooltip instead.
          return collapsed ? (
            <Tooltip key={room.id}>
              <TooltipTrigger asChild>{item}</TooltipTrigger>
              <TooltipContent side="right">{room.name}</TooltipContent>
            </Tooltip>
          ) : (
            item
          );
        })}
      </div>
    </nav>
  );
}
