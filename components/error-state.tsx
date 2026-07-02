"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out-strong">
      {/* destructive/10, not the PDF file tint — danger has its own hue */}
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-300 motion-safe:ease-out-back">
        <CircleAlert className="size-6 text-danger" strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-sm font-medium">Couldn&apos;t load this view</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Something interrupted loading the data.
      </p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
