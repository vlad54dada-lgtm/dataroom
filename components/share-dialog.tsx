"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Globe, Link2, Loader2, Lock } from "lucide-react";
import type { Node } from "@/types";
import { createShare, getShare, revokeShare, type ShareInfo } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShareDialogProps {
  /** The file being shared; null when closed. */
  file: Node | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/** Absolute, copy-pasteable link for a token (client-only app → window is safe). */
function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/**
 * The file's sharing settings. A file has at most one public link: turning
 * sharing on mints an unguessable token anyone can open with no sign-in;
 * turning it off deletes the token so the old link dies at once. Minimal
 * friction — creating a link copies it straight to the clipboard.
 */
export function ShareDialog({ file, onClose, returnFocusTo }: ShareDialogProps) {
  // Held past close so content doesn't blank mid-exit (adjust-during-render).
  const [shownFile, setShownFile] = useState<Node | null>(file);
  if (file && file !== shownFile) setShownFile(file);
  const shown = file ?? shownFile;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Load the current link state each time the dialog opens on a file.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setStatus("loading");
    setCopied(false);
    getShare(file.id).then(
      (info) => {
        if (cancelled) return;
        setShare(info);
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [file, reloadKey]);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      return false;
    }
  };

  const handleCreate = async () => {
    if (!shown) return;
    setBusy(true);
    try {
      const info = await createShare(shown.id);
      setShare(info);
      const didCopy = await copy(info.token);
      toast.success(didCopy ? "Link created and copied" : "Share link created", {
        description: shown.name,
      });
    } catch {
      toast.error("Couldn't create the link");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!shown) return;
    setBusy(true);
    try {
      await revokeShare(shown.id);
      setShare(null);
      toast.success("Sharing turned off", { description: shown.name });
    } catch {
      toast.error("Couldn't stop sharing");
    } finally {
      setBusy(false);
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
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreFocus}>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Share file</DialogTitle>
          <DialogDescription className="truncate">{shown?.name}</DialogDescription>
        </DialogHeader>

        {status === "loading" ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 rounded-card border px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load the sharing settings.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Try again
            </Button>
          </div>
        ) : share ? (
          <div className="space-y-4">
            {/* Access status banner: the link is live for anyone who holds it. */}
            <div className="flex items-start gap-3 rounded-card border bg-folder-bg/40 px-3 py-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-tile bg-folder-bg text-brand ring-1 ring-brand/15 ring-inset">
                <Globe className="size-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Anyone with the link</p>
                <p className="text-xs text-muted-foreground">
                  Can view this file in the browser — no sign-in required.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl(share.token)}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void copy(share.token)}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="flex justify-end border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void handleRevoke()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Lock />}
                Stop sharing
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-card border px-3 py-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-tile bg-muted text-muted-foreground">
                <Lock className="size-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Private</p>
                <p className="text-xs text-muted-foreground">
                  Only you can open this file. Create a link to let anyone view it.
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
              Create share link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
