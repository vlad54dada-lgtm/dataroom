"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { FileText, Folder, Trash2, X } from "lucide-react";
import { countTrash, listTrash, purgeNode } from "@/lib/storage";
import { MOVE_MIME, RESTORE_MIME, readIds, startDragGhost } from "@/lib/dnd";
import { useAsync } from "@/lib/hooks/use-async";
import { cn } from "@/lib/utils";
import { RoomAvatar } from "@/components/room-avatar";

/** Where the Back button on the trash page returns to. */
export const TRASH_RETURN_KEY = "trash-return-to";

const PEEK_SIZE = 4;

/** How long the ✕ must be held before it deletes forever. */
const HOLD_MS = 650;

/**
 * Hold-to-confirm delete. A quick click can't destroy anything — pressing
 * starts a red fill sweeping the button (slow, deliberate), releasing early
 * snaps it back (fast), and only a full hold confirms. A misclick literally
 * demonstrates the gesture instead of deleting a file.
 */
function HoldToDeleteX({
  name,
  onConfirm,
}: {
  name: string;
  onConfirm: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  return (
    <button
      type="button"
      tabIndex={-1}
      draggable={false}
      aria-label={`Hold to delete ${name} forever`}
      title="Hold to delete forever"
      onPointerDown={(e) => {
        e.preventDefault();
        setHolding(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          setHolding(false);
          onConfirm();
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onDragStart={(e) => {
        // The row is draggable — a hold must never start a drag.
        e.preventDefault();
        e.stopPropagation();
      }}
      className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground opacity-0 transition-[color,opacity] duration-150 group-hover/peek:opacity-100 hover:bg-destructive/10 hover:text-destructive"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 bg-destructive",
          holding
            ? "[clip-path:inset(0_0_0_0)] transition-[clip-path] duration-[650ms] ease-linear"
            : "[clip-path:inset(0_100%_0_0)] transition-[clip-path] duration-150 ease-out",
        )}
      />
      <X
        className={cn(
          "relative size-4 transition-colors duration-150",
          holding && "text-destructive-foreground",
        )}
      />
    </button>
  );
}

/**
 * Floating trash entry, bottom-right, with a live count badge. Hovering
 * (or focusing) fans out a small stack of the most recently deleted items,
 * macOS-dock style; clicking anywhere goes to the trash page. Adapter
 * mutations emit `trash-changed`, which refreshes both badge and stack.
 */
export function TrashFab() {
  const pathname = usePathname();
  // Portaled to <body>: the header renders this component, but the button
  // must be LAST in the tab order — it is visually last on the page.
  // (useSyncExternalStore = hydration-safe "is client" without an effect.)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [peeking, setPeeking] = useState(false);
  // Purged-from-the-peek ids vanish immediately; the server refresh
  // catches up via trash-changed.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  // A stack item is being dragged out: the stack must stay MOUNTED even if
  // the pointer leaves — unmounting the drag source mid-flight kills the
  // browser's dragend and strands the drag ghost.
  const [dragOut, setDragOut] = useState(false);
  // Rows from the list are hovering over the button ("drag here to trash").
  const [dropReady, setDropReady] = useState(false);
  // Grace period so diagonal cursor paths to the stack never collapse it.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPeek = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPeeking(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPeeking(false), 250);
  };
  const { state: countState, reload: reloadCount } = useAsync(
    countTrash,
    "trash-count",
  );
  // The stack is fetched lazily on first hover, then kept fresh by events.
  const peek = useAsync(
    () => (peeking ? listTrash() : Promise.resolve([])),
    peeking ? "trash-peek" : "trash-peek-idle",
  );

  const reloadPeek = peek.reload;
  useEffect(() => {
    const refresh = () => {
      reloadCount();
      reloadPeek();
    };
    window.addEventListener("trash-changed", refresh);
    return () => window.removeEventListener("trash-changed", refresh);
  }, [reloadCount, reloadPeek]);

  if (pathname === "/trash" || !mounted) return null;
  const count = countState.status === "success" ? countState.data : 0;
  const items =
    peek.state.status === "success"
      ? peek.state.data
          .filter((i) => !removedIds.has(i.node.id))
          .slice(0, PEEK_SIZE)
      : [];
  const overflow = count - items.length;

  return createPortal(
    <div
      className="fixed right-6 bottom-6 z-40"
      onPointerEnter={openPeek}
      onPointerLeave={scheduleClose}
    >
      {/* The fan-out stack: drag an item into the folder view to restore
          it there; the ✕ deletes it forever on the spot. */}
      {/* bottom-full keeps the hover area continuous with the button — no
          dead zone where the stack collapses mid-way to the cursor. */}
      {(peeking || dragOut) && count > 0 && items.length > 0 && (
        <div className="absolute right-0 bottom-full w-64 pb-2">
          <div className="flex flex-col-reverse gap-1">
            {items.map((item, i) => (
              <div
                key={item.node.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    RESTORE_MIME,
                    JSON.stringify([item.node.id]),
                  );
                  e.dataTransfer.effectAllowed = "move";
                  startDragGhost(
                    e.dataTransfer,
                    item.node.name,
                    1,
                    item.node.type === "file" ? "file" : "folder",
                  );
                  setDragOut(true);
                  window.dispatchEvent(
                    new CustomEvent("dnd-drag", {
                      detail: { kind: "restore", active: true, count: 1 },
                    }),
                  );
                }}
                onDragEnd={() => {
                  setDragOut(false);
                  scheduleClose();
                  window.dispatchEvent(
                    new CustomEvent("dnd-drag", {
                      detail: { kind: "restore", active: false, count: 0 },
                    }),
                  );
                }}
                style={{ animationDelay: `${i * 45}ms` }}
                className="group/peek flex h-11 cursor-grab items-center gap-2.5 rounded-xl border bg-popover px-3 shadow-popover transition-colors hover:bg-muted/60 active:cursor-grabbing motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-200 motion-safe:fill-mode-backwards dark:hover:bg-foreground/10"
              >
                {item.node.type === "dataroom" ? (
                  <RoomAvatar
                    icon={item.node.icon}
                    color={item.node.color}
                    size="sm"
                    className="size-7"
                  />
                ) : (
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                      item.node.type === "folder" ? "bg-folder-bg" : "bg-file-bg"
                    }`}
                  >
                    {item.node.type === "folder" ? (
                      <Folder className="size-4 text-folder" strokeWidth={1.75} />
                    ) : (
                      <FileText className="size-4 text-file" strokeWidth={1.75} />
                    )}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.node.name}
                </span>
                <HoldToDeleteX
                  name={item.node.name}
                  onConfirm={() => {
                    // Optimistic: the row leaves the stack the moment the
                    // hold completes — no 1-2s "did it work?" limbo.
                    const id = item.node.id;
                    setRemovedIds((prev) => new Set(prev).add(id));
                    void purgeNode(id)
                      .then(() => toast.success("Deleted forever"))
                      .catch(() => {
                        setRemovedIds((prev) => {
                          const next = new Set(prev);
                          next.delete(id);
                          return next;
                        });
                        toast.error("Couldn't delete it");
                      });
                  }}
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 pr-1 text-right text-xs text-muted-foreground">
            {overflow > 0
              ? `And ${overflow} more in the trash`
              : "Drag out to restore · hold ✕ to delete"}
          </p>
        </div>
      )}

      <Link
        href="/trash"
        aria-label={
          count > 0
            ? `Trash, ${count} ${count === 1 ? "item" : "items"}`
            : "Trash"
        }
        onClick={() => {
          // Let the trash page's Back button return exactly here.
          sessionStorage.setItem(
            TRASH_RETURN_KEY,
            window.location.pathname + window.location.search,
          );
        }}
        onFocus={openPeek}
        onBlur={scheduleClose}
        data-trash-fab
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(MOVE_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropReady(true);
        }}
        onDragLeave={() => setDropReady(false)}
        onDrop={(e) => {
          setDropReady(false);
          const ids = readIds(e.dataTransfer, MOVE_MIME);
          if (ids.length === 0) return;
          e.preventDefault();
          // The page owning the rows performs the actual move to trash.
          window.dispatchEvent(
            new CustomEvent("trash-drop-nodes", { detail: { ids } }),
          );
        }}
        className={cn(
          "relative flex size-12 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow-float transition-[box-shadow,translate,scale,color] duration-200 ease-out-strong outline-none hover:-translate-y-0.5 hover:text-foreground hover:shadow-overlay active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-line-strong",
          dropReady &&
            "scale-110 text-brand outline-2 outline-offset-2 outline-brand outline-dashed",
        )}
      >
        <Trash2 className="size-5" strokeWidth={1.75} />
        {count > 0 && (
          // Keyed: every count change pops the badge, so a delete you just
          // made registers even at the edge of your vision.
          <span
            key={count}
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-200 motion-safe:ease-out-back"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </div>,
    document.body,
  );
}
