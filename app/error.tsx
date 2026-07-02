"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary: an unexpected render/runtime error shows a
 * calm recovery screen instead of Next.js's blank production page. Data
 * lives in Supabase, so nothing is lost — say so.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-file-bg">
        <CircleAlert className="size-6 text-danger" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-sm font-medium">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        An unexpected error interrupted this view. Your documents are safe.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button asChild>
          <Link href="/">Go to datarooms</Link>
        </Button>
      </div>
    </main>
  );
}
