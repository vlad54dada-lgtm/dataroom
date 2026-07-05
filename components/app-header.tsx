import Image from "next/image";
import Link from "next/link";
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
      {/* Sticky, solid: content passes under an opaque bar — no frosted
          translucency in this register. z-30 sits below menus and dialogs
          (z-50) and the floating trash/selection layer (z-40). */}
      <header className="sticky top-0 z-30 border-b bg-card">
        {/* Same outer frame as the room layout (soft 1720px max) — the
            brand mark sits on one vertical rhythm with the rail below it;
            home and trash center their own content inside. */}
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 px-8">
          <Link
            href="/"
            aria-label="Acme Corp. home"
            className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
          >
            {/* App-icon treatment: the mark keeps its own baked backdrop
                inside a rounded, hairline-ringed tile — reads as a product
                icon in both themes. */}
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="size-9 shrink-0 rounded-lg ring-1 ring-foreground/10 ring-inset"
            />
            <span className="flex items-baseline gap-2">
              <span className="font-heading text-[15px] font-semibold">
                Acme Corp.
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Dataroom
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
