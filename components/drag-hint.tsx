"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FolderInput, RotateCcw, Trash2 } from "lucide-react";

interface DragDetail {
  kind: "move" | "restore";
  active: boolean;
  count: number;
}

/**
 * Small floating hint that appears while a drag is in flight and names the
 * valid drop targets — rows: folders / breadcrumbs / the trash button;
 * trash items on the home screen: dataroom cards. Purely informative,
 * never interactive. (In the room view, restore drops get a full-area
 * overlay instead, so the hint stays quiet there.)
 */
export function DragHint() {
  const pathname = usePathname();
  const [drag, setDrag] = useState<DragDetail | null>(null);

  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<DragDetail>).detail;
      setDrag(detail.active ? detail : null);
    };
    window.addEventListener("dnd-drag", handle);
    return () => window.removeEventListener("dnd-drag", handle);
  }, []);

  if (!drag) return null;
  if (drag.kind === "restore" && pathname !== "/") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center">
      <div className="flex items-center gap-1.5 rounded-full bg-foreground/90 px-3.5 py-1.5 text-xs font-medium text-background shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
        {drag.kind === "restore" ? (
          <>
            <RotateCcw className="size-3.5" aria-hidden />
            Drop on a dataroom to restore
          </>
        ) : (
          <>
            <FolderInput className="size-3.5" aria-hidden />
            Drop on a folder or breadcrumb to move
            <span className="mx-0.5 opacity-50" aria-hidden>
              ·
            </span>
            <Trash2 className="size-3.5" aria-hidden />
            on the trash to delete
          </>
        )}
      </div>
    </div>
  );
}
