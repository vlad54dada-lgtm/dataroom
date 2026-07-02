"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { Node } from "@/types";
import { getBlob } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import { Button } from "@/components/ui/button";
import { PdfCanvasViewer } from "@/components/pdf-canvas-viewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PdfViewerDialogProps {
  /** The file being viewed; null when closed. */
  file: Node | null;
  onClose: () => void;
  /** Element to focus when the viewer closes (the file row's button). */
  returnFocusTo?: HTMLElement | null;
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

  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  const { state } = useAsync(async () => {
    if (!blobKey) return null;
    const blob = await getBlob(blobKey);
    return blob ? URL.createObjectURL(blob) : null;
  }, blobKey ?? "closed");

  const url = state.status === "success" ? state.data : null;
  const unavailable =
    blobKey !== null &&
    (state.status === "error" ||
      (state.status === "success" && state.data === null));

  // Revoke exactly once per created URL — on change, close, or unmount.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <Dialog open={file !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onCloseAutoFocus={restoreFocus}
        className="flex h-[90vh] w-[92vw] max-w-5xl flex-col gap-3 p-4 sm:max-w-5xl"
      >
        <DialogHeader className="flex-row items-center gap-3 pr-10">
          <DialogTitle
            className="min-w-0 flex-1 truncate text-sm"
            title={shown?.name}
          >
            {shown?.name}
          </DialogTitle>
          {url && shown && (
            <Button variant="outline" size="sm" asChild>
              <a href={url} download={shown.name}>
                <Download /> Download
              </a>
            </Button>
          )}
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          {blobKey !== null && state.status === "loading" && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Loading&hellip;
            </div>
          )}
          {unavailable && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              This file is unavailable.
            </div>
          )}
          {url && shown && !canvasFailed && (
            <PdfCanvasViewer
              key={blobKey ?? url}
              url={url}
              onRenderError={() => setFailedKey(blobKey)}
            />
          )}
          {url && shown && canvasFailed && (
            <>
              <iframe
                src={url}
                title={shown.name}
                className="min-h-0 w-full flex-1 rounded-lg border bg-white"
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
