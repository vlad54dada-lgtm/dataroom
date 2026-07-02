"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trash2 } from "lucide-react";
import { countTrash } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Floating trash entry, bottom-right: always within reach, with a live
 * count badge. Hidden on the trash page itself. Adapter mutations emit
 * `trash-changed`, which refreshes the badge without polling.
 */
export function TrashFab() {
  const pathname = usePathname();
  const { state, reload } = useAsync(countTrash, "trash-count");

  useEffect(() => {
    window.addEventListener("trash-changed", reload);
    return () => window.removeEventListener("trash-changed", reload);
  }, [reload]);

  if (pathname === "/trash") return null;
  const count = state.status === "success" ? state.data : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/trash"
          aria-label={
            count > 0
              ? `Trash, ${count} ${count === 1 ? "item" : "items"}`
              : "Trash"
          }
          className="fixed right-6 bottom-6 z-40 flex size-12 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-lg transition-[box-shadow,transform,color] outline-none hover:-translate-y-0.5 hover:text-foreground hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <Trash2 className="size-5" strokeWidth={1.75} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-medium text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="left">Trash</TooltipContent>
    </Tooltip>
  );
}
