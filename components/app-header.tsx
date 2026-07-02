import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";

/** App-wide header. `children` hosts the room view's breadcrumbs. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-6">
        <Link
          href="/"
          aria-label="DataRoom home"
          className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-brand">
            <FileText className="size-3.5 text-white" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold">DataRoom</span>
        </Link>
        {children}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Trash"
            className="text-muted-foreground"
            asChild
          >
            <Link href="/trash">
              <Trash2 />
            </Link>
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
