import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundStateProps {
  kind: "room" | "folder";
}

export function NotFoundState({ kind }: NotFoundStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out-strong">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-300 motion-safe:ease-out-back">
        <SearchX className="size-6 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-sm font-medium">
        {kind === "room" ? "Dataroom not found" : "Folder not found"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been deleted, or the link may be wrong.
      </p>
      <Button variant="outline" className="mt-4" asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
