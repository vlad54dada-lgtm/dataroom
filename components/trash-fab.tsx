"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Folder, Trash2 } from "lucide-react";
import { countTrash, listTrash } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import { RoomAvatar } from "@/components/room-avatar";

const PEEK_SIZE = 4;

/**
 * Floating trash entry, bottom-right, with a live count badge. Hovering
 * (or focusing) fans out a small stack of the most recently deleted items,
 * macOS-dock style; clicking anywhere goes to the trash page. Adapter
 * mutations emit `trash-changed`, which refreshes both badge and stack.
 */
export function TrashFab() {
  const pathname = usePathname();
  const [peeking, setPeeking] = useState(false);
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

  if (pathname === "/trash") return null;
  const count = countState.status === "success" ? countState.data : 0;
  const items =
    peek.state.status === "success" ? peek.state.data.slice(0, PEEK_SIZE) : [];
  const overflow = count - items.length;

  return (
    <div
      className="fixed right-6 bottom-6 z-40"
      onPointerEnter={() => setPeeking(true)}
      onPointerLeave={() => setPeeking(false)}
    >
      {/* The fan-out stack */}
      {peeking && count > 0 && items.length > 0 && (
        <div
          aria-hidden
          className="absolute right-0 bottom-14 w-64 pb-1"
        >
          <div className="flex flex-col-reverse gap-1">
            {items.map((item, i) => (
              <Link
                key={item.node.id}
                href="/trash"
                tabIndex={-1}
                style={{ animationDelay: `${i * 45}ms` }}
                className="flex h-11 items-center gap-2.5 rounded-xl border bg-popover px-3 shadow-md outline-none backdrop-blur transition-colors hover:bg-muted/60 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-200 motion-safe:fill-mode-backwards"
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
              </Link>
            ))}
          </div>
          {overflow > 0 && (
            <p className="mt-1.5 pr-1 text-right text-xs text-muted-foreground">
              and {overflow} more in the trash
            </p>
          )}
        </div>
      )}

      <Link
        href="/trash"
        aria-label={
          count > 0
            ? `Trash, ${count} ${count === 1 ? "item" : "items"}`
            : "Trash"
        }
        onFocus={() => setPeeking(true)}
        onBlur={() => setPeeking(false)}
        className="relative flex size-12 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-lg transition-[box-shadow,transform,color] outline-none hover:-translate-y-0.5 hover:text-foreground hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <Trash2 className="size-5" strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </div>
  );
}
