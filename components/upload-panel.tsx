"use client";

import { Check, CircleAlert, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type UploadFileStatus = "queued" | "uploading" | "done" | "error";

export interface UploadState {
  files: { name: string; status: UploadFileStatus }[];
  /** null while the queue is still draining. */
  outcome: "done" | "cancelled" | null;
}

interface UploadPanelProps {
  state: UploadState;
  onCancel: () => void;
  onDismiss: () => void;
}

/**
 * Floating upload progress, bottom-left: per-file statuses, a real
 * progress bar, and Cancel (takes effect after the file in flight).
 */
export function UploadPanel({ state, onCancel, onDismiss }: UploadPanelProps) {
  const total = state.files.length;
  const done = state.files.filter((f) => f.status === "done").length;
  const failed = state.files.filter((f) => f.status === "error").length;
  const running = state.outcome === null;
  const settled = done + failed;
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100);

  const title = running
    ? `Uploading ${Math.min(settled + 1, total)} of ${total}…`
    : state.outcome === "cancelled"
      ? `Upload cancelled — ${done} uploaded`
      : failed > 0
        ? `${done} uploaded · ${failed} failed`
        : `${done} ${done === 1 ? "file" : "files"} uploaded`;

  return (
    <div className="fixed bottom-6 left-6 z-40 w-80 max-w-[calc(100vw-3rem)] rounded-card border bg-popover p-3 shadow-float motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 motion-safe:ease-out-strong">
      <div className="flex items-center justify-between gap-2">
        {/* Live region announces batch progress; the file list stays out
            of it so screen readers aren't spammed per row. */}
        <div role="status" aria-live="polite" className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
        </div>
        {running ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            className="text-muted-foreground"
            onClick={onDismiss}
          >
            <X />
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Upload progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto">
        {state.files.map((f, i) => (
          <li
            key={`${f.name}-${i}`}
            className="flex min-w-0 items-center gap-2 text-xs"
          >
            {f.status === "uploading" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" />
            ) : f.status === "done" ? (
              <Check className="size-3.5 shrink-0 text-brand" />
            ) : f.status === "error" ? (
              <CircleAlert className="size-3.5 shrink-0 text-destructive" />
            ) : (
              <span
                className="mx-1 size-1.5 shrink-0 rounded-full bg-border"
                aria-hidden
              />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                f.status === "queued"
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
              title={f.name}
            >
              {f.name}
            </span>
            {f.status === "error" && (
              <span
                className="shrink-0 text-destructive"
                title="Upload failed — check the connection and try again"
              >
                Failed
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
