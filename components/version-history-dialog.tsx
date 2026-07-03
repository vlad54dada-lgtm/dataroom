"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, History, Loader2, RotateCcw } from "lucide-react";
import type { Node } from "@/types";
import { getBlob, listFileVersions, type FileVersion } from "@/lib/storage";
import { formatBytes, formatDateTime, splitExtension } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VersionHistoryDialogProps {
  /** The file whose history to show; null when closed. */
  file: Node | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  /** Makes `version` current again; resolves to the updated node. */
  onRestore: (file: Node, version: FileVersion) => Promise<Node>;
}

/**
 * Linear version history for a file: newest first, the current version
 * badged, older ones downloadable and restorable ("make current" appends
 * a new version — history is never rewritten).
 */
export function VersionHistoryDialog({
  file,
  onClose,
  returnFocusTo,
  onRestore,
}: VersionHistoryDialogProps) {
  // Held past close for the exit animation (adjust-during-render).
  const [shownFile, setShownFile] = useState<Node | null>(file);
  if (file && file !== shownFile) setShownFile(file);
  const shown = file ?? shownFile;

  // The node advances after a restore (new blob/size) — track it locally
  // so the version list re-derives who is current.
  const [node, setNode] = useState<Node | null>(shown);
  if (shown && node?.id !== shown.id) setNode(shown);

  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [error, setError] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!node || file === null) return;
    let cancelled = false;
    void listFileVersions(node)
      .then((list) => {
        if (!cancelled) {
          setVersions(list);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // reloadKey re-runs the fetch after a restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, node?.blobKey, file === null, reloadKey]);

  const handleDownload = async (version: FileVersion) => {
    if (!node) return;
    const blob = await getBlob(version.blobKey);
    if (!blob) {
      toast.error("Couldn't download this version");
      return;
    }
    const { base, ext } = splitExtension(node.name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = version.isCurrent ? node.name : `${base} (v${version.version})${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (version: FileVersion) => {
    if (!node) return;
    setRestoringId(version.id);
    try {
      const updated = await onRestore(node, version);
      setNode(updated);
      setVersions(null);
      setReloadKey((k) => k + 1);
    } catch {
      toast.error("Couldn't restore this version");
    } finally {
      setRestoringId(null);
    }
  };

  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  return (
    <Dialog open={file !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={restoreFocus}
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            Version history
          </DialogTitle>
          <DialogDescription className="truncate">
            {shown?.name}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-card border px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load the version history.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVersions(null);
                setError(false);
                setReloadKey((k) => k + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : versions === null ? (
          <div className="divide-y overflow-hidden rounded-card border">
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className="flex h-14 items-center gap-3 px-3"
                style={{ "--skeleton-delay": `${i * 90}ms` } as React.CSSProperties}
              >
                <Skeleton className="size-8 rounded-tile" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-80 divide-y overflow-y-auto rounded-card border">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-tile bg-muted text-muted-foreground">
                  <History className="size-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Version {v.version}
                    {v.isCurrent && (
                      <span className="rounded-full bg-folder-bg px-2 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/15 ring-inset">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(v.createdAt)} · {formatBytes(v.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download version ${v.version}`}
                  title="Download this version"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => void handleDownload(v)}
                >
                  <Download />
                </Button>
                {!v.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={restoringId !== null}
                    onClick={() => void handleRestore(v)}
                  >
                    {restoringId === v.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    Make current
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
