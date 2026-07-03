import Link from "next/link";
import { FileText } from "lucide-react";
import { DragHint } from "@/components/drag-hint";
import { ThemeToggle } from "@/components/theme-toggle";
import { TrashFab } from "@/components/trash-fab";
import { UserMenu } from "@/components/user-menu";

/**
 * App-wide header for Acme Corp.'s data room. `children` hosts the room
 * view's breadcrumbs. Also mounts the floating trash button so every
 * authenticated screen gets it.
 */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-6">
          <Link
            href="/"
            aria-label="Acme Corp. home"
            className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* bg-primary, not bg-brand: dark --brand is a link blue that
                fails AA under white; --primary is the guaranteed pair. */}
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary">
              <FileText className="size-4 text-primary-foreground" strokeWidth={2} />
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight">
                Acme Corp.
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Data room
              </span>
            </span>
          </Link>
          {children}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <TrashFab />
      <DragHint />
    </>
  );
}
