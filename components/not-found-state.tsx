import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundStateProps {
  kind: "room" | "folder";
}

export function NotFoundState({ kind }: NotFoundStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <SearchX className="size-6 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <p className="mt-4 font-heading text-lg font-medium">
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
