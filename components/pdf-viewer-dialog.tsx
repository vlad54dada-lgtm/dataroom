"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import type { Node } from "@/types";
import { getBlob } from "@/lib/storage";
import { formatBytes } from "@/lib/utils";
import { useSession } from "@/lib/hooks/use-session";
import { Button } from "@/components/ui/button";
import { PdfCanvasViewer } from "@/components/pdf-canvas-viewer";

type BlobState =
  | { key: string; status: "loading" | "error" | "missing"; url: null }
  | { key: string; status: "ready"; url: string };
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PdfViewerDialogProps {
  /** The file being viewed; null when closed. */
  file: Node | null;
  onClose: () => void;
  /** Element to focus when the viewer closes (the file row's button). */
  returnFocusTo?: HTMLElement | null;
  /**
   * Opened from a content-search hit: the find bar arms with this query and
   * jumps to the first match. Keyed to `file`, so it only arms on open.
   */
  initialFind?: string;
  /**
   * Flip through the folder's files without leaving the viewer —
   * gallery-style ‹ 2 of 5 › plus the arrow keys.
   */
  nav?: {
    index: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
}

/**
 * Near-full-screen PDF viewer. The blob renders in an iframe via an object
 * URL created in the loader and revoked exactly once when it changes or the
 * dialog closes. Download is ALWAYS visible (header + a helper line under
 * the iframe) — on some hosts a blocked iframe shows a blank area with no
 * error, so the escape hatch never depends on detecting failure.
 */
export function PdfViewerDialog({
  file,
  onClose,
  returnFocusTo,
  initialFind,
  nav,
}: PdfViewerDialogProps) {
  // Held past close so the title/iframe don't blank out mid-exit-animation
  // (adjust-during-render pattern; `file` goes null the moment close starts).
  const [shownFile, setShownFile] = useState<Node | null>(file);
  if (file && file !== shownFile) setShownFile(file);
  const shown = file ?? shownFile;
  const blobKey = shown?.blobKey ?? null;

  // pdf.js couldn't parse THIS document — fall back to the browser's
  // iframe renderer for it (per-file, so the next file tries canvas again).
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const canvasFailed = failedKey !== null && failedKey === blobKey;

  // Every page carries who is looking at it — the data-room watermark.
  const session = useSession();
  const watermark = {
    title: "Confidential",
    subtitle:
      session.status === "signed-in" ? (session.user.email ?? undefined) : undefined,
  };

  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  // Blob loading is hand-rolled (not useAsync): the SWR fallback there
  // would replay a stale "closed" snapshot on reopen and flash the error
  // copy where a loading state belongs. Only SETTLED results are stored;
  // "loading" is simply "no settled result for the current key yet".
  const [blob, setBlob] = useState<BlobState | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    if (!blobKey) return; // closing: keep the last document for the exit
    let cancelled = false;
    getBlob(blobKey).then(
      (data) => {
        if (cancelled) return;
        setBlob(
          data
            ? { key: blobKey, status: "ready", url: URL.createObjectURL(data) }
            : { key: blobKey, status: "missing", url: null },
        );
      },
      () => {
        if (!cancelled) setBlob({ key: blobKey, status: "error", url: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blobKey, retryTick]);

  const settled = blob !== null && blob.key === blobKey ? blob : null;
  const url =
    settled?.status === "ready"
      ? settled.url
      : !blobKey && blob?.status === "ready"
        ? blob.url // dialog closing: hold the document through the exit
        : null;
  const loading = blobKey !== null && settled === null;
  const unavailable = settled?.status === "missing";
  const loadFailed = settled?.status === "error";

  // Revoke exactly once per created URL — on change, close, or unmount.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <Dialog open={file !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onCloseAutoFocus={restoreFocus}
        // Radix would auto-focus the tabIndex={0} scroll container, and
        // programmatic focus matches :focus-visible — every mouse open
        // framed the document in a full-perimeter ring. Focus rests on the
        // dialog; Tab still reaches (and rings) the scroller honestly.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // While the viewer's find bar is open, Escape closes IT, not the
        // dialog (Radix handles Escape in capture phase, so the bar can't
        // defend itself with stopPropagation).
        onEscapeKeyDown={(e) => {
          if (document.querySelector("[data-pdf-find-open]")) {
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          // ←/→ flip files — unless the document itself can scroll
          // horizontally (zoomed in), where arrows must keep panning.
          if (!nav || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
          const target = e.target as HTMLElement;
          const scroller = target.closest('[role="document"]');
          if (scroller && scroller.scrollWidth > scroller.clientWidth + 1)
            return;
          e.preventDefault();
          if (e.key === "ArrowRight" && nav.index < nav.total - 1) nav.onNext();
          if (e.key === "ArrowLeft" && nav.index > 0) nav.onPrev();
        }}
        className="flex h-[90dvh] w-[92vw] max-w-5xl flex-col gap-3 p-4 sm:max-w-5xl"
      >
        <DialogHeader className="flex-row items-center gap-3 pr-10">
          <DialogTitle
            // font-sans: the title here is the FILENAME — data, not a
            // display moment — so it opts out of the serif heading voice.
            className="min-w-0 flex-1 truncate font-sans text-sm"
            title={shown?.name}
          >
            {shown?.name}
          </DialogTitle>
          {/* Document identity in the ledger-caps register — the file is
              an object with facts, not just a window title. */}
          {shown?.size != null && (
            <span className="hidden shrink-0 items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase text-muted-foreground sm:flex">
              PDF · {formatBytes(shown.size)}
            </span>
          )}
          <DialogDescription className="sr-only">
            Document preview with zoom and paging controls.
          </DialogDescription>
          {nav && nav.total > 1 && (
            // Labelled like the page stepper below ("Page X of Y") — the
            // matching anatomy is what disambiguates files from pages.
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous file"
                title="Previous file (←)"
                disabled={nav.index <= 0}
                onClick={nav.onPrev}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
                File {nav.index + 1} of {nav.total}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next file"
                title="Next file (→)"
                disabled={nav.index >= nav.total - 1}
                onClick={nav.onNext}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          {url && shown && (
            <Button variant="outline" size="sm" asChild>
              <a href={url} download={shown.name}>
                <Download /> Download
              </a>
            </Button>
          )}
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          {loading && (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Loader2
                className="size-5 animate-spin"
                aria-label="Loading document"
              />
            </div>
          )}
          {unavailable && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              This file is unavailable.
            </div>
          )}
          {loadFailed && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <p>Couldn&apos;t load the document.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBlob(null); // back to the loading state immediately
                  setRetryTick((t) => t + 1);
                }}
              >
                Try again
              </Button>
            </div>
          )}
          {url && shown && !canvasFailed && (
            <PdfCanvasViewer
              key={blobKey ?? url}
              url={url}
              onRenderError={() => setFailedKey(blobKey)}
              watermark={watermark}
              initialFind={initialFind}
            />
          )}
          {url && shown && canvasFailed && (
            <>
              <iframe
                src={url}
                title={shown.name}
                className="min-h-0 w-full flex-1 rounded-lg border bg-white dark:border-line-strong"
              />
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Can&apos;t preview?{" "}
                <a
                  href={url}
                  download={shown.name}
                  className="font-medium text-brand hover:underline"
                >
                  Download the file
                </a>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
