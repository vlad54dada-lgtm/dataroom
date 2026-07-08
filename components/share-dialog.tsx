"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Globe, Loader2, Lock } from "lucide-react";
import type { Node } from "@/types";
import {
  createShare,
  getShare,
  revokeShare,
  type ShareInfo,
} from "@/lib/storage";
import { cn, formatModified, siteOrigin } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PeopleWithAccess } from "@/components/people-with-access";

interface ShareDialogProps {
  /** The file or folder being shared; null when closed. */
  node: Node | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/** Absolute, copy-pasteable link for a token, pinned to the canonical origin. */
function shareUrl(token: string): string {
  return `${siteOrigin()}/share/${token}`;
}

// Settled result for one node — "loading" is simply "no settled state for
// the current node yet" (derived, so the effect never sets state directly).
type ShareState =
  | { nodeId: string; status: "ready"; share: ShareInfo | null }
  | { nodeId: string; status: "error" };

/**
 * Sharing settings for a file or folder — the Google-Drive access model, so
 * there is ONE coherent policy rather than two competing toggles:
 *   • "People with access" — specific people invited by email, each with a
 *     viewer/editor role (editor is the reason named access still matters when
 *     a public link is on: the link is always view-only);
 *   • "General access" — the blanket floor for everyone else, switched between
 *     Restricted (only invited people) and Anyone-with-the-link (view-only, no
 *     sign-in). Switching mints or revokes the capability link.
 * Owner-only — the entry points are gated before this dialog ever opens.
 */
export function ShareDialog({ node, onClose, returnFocusTo }: ShareDialogProps) {
  // Held past close so content doesn't blank mid-exit (adjust-during-render).
  const [shownNode, setShownNode] = useState<Node | null>(node);
  if (node && node !== shownNode) setShownNode(node);
  const shown = node ?? shownNode;
  const isFolder = shown?.type === "folder";

  const [settled, setSettled] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Load the current link each time the dialog opens on a node. Only the
  // async completion writes state; the loading UI is derived.
  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    getShare(node.id).then(
      (share) => {
        if (!cancelled)
          setSettled({ nodeId: node.id, status: "ready", share });
      },
      () => {
        if (!cancelled) setSettled({ nodeId: node.id, status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [node, reloadKey]);

  const current = settled && settled.nodeId === shown?.id ? settled : null;
  const loading = node !== null && current === null;
  const share = current?.status === "ready" ? current.share : null;

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
      setSettled({ nodeId: shown.id, status: "ready", share: info });
      toast.success("Anyone with the link can now view", {
        description: shown.name,
      });
    } catch {
      toast.error("Couldn't turn on the link");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!shown) return;
    setBusy(true);
    try {
      await revokeShare(shown.id);
      setSettled({ nodeId: shown.id, status: "ready", share: null });
      toast.success("Access set to restricted", { description: shown.name });
    } catch {
      toast.error("Couldn't change access");
    } finally {
      setBusy(false);
    }
  };

  // General access is one control with two states: "restricted" (no link) and
  // "public" (a live view-only link). Switching mints or revokes the link.
  const handleAccessChange = (value: string) => {
    if (busy) return;
    const wantPublic = value === "public";
    if (wantPublic === (share !== null)) return; // already in that state
    if (wantPublic) void handleCreate();
    else void handleRevoke();
  };

  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  return (
    <Dialog open={node !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[88dvh] overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={restoreFocus}
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {isFolder ? "Share folder" : "Share file"}
          </DialogTitle>
          <DialogDescription className="truncate">
            {shown?.name}
          </DialogDescription>
        </DialogHeader>

        {/* People with access — keyed per node so it remounts fresh on open. */}
        {shown && <PeopleWithAccess key={shown.id} node={shown} />}

        <div className="space-y-3 border-t pt-5">
          <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
            General access
          </p>

          {loading ? (
            <Skeleton className="h-[4.25rem] w-full rounded-card" />
          ) : current?.status === "error" ? (
            <div className="flex flex-col items-center gap-3 rounded-card border px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load the sharing settings.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettled(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* One row, two states. The dropdown IS the toggle: picking a
                  level mints or revokes the link — no separate create/remove
                  buttons to reason about. */}
              <div className="flex items-center gap-3 rounded-card border px-3 py-2.5">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-tile ring-1 ring-inset transition-colors",
                    share
                      ? "bg-folder-bg text-brand ring-brand/20"
                      : "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  {share ? (
                    <Globe className="size-5" strokeWidth={1.75} />
                  ) : (
                    <Lock className="size-5" strokeWidth={1.75} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={busy}
                        className="-ml-1.5 flex max-w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/70 disabled:opacity-60"
                      >
                        {busy && (
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        )}
                        <span className="truncate">
                          {share ? "Anyone with the link" : "Restricted"}
                        </span>
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuRadioGroup
                        value={share ? "public" : "restricted"}
                        onValueChange={handleAccessChange}
                      >
                        <DropdownMenuRadioItem value="restricted">
                          Restricted
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="public">
                          Anyone with the link
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <p className="mt-0.5 px-1.5 text-xs text-muted-foreground">
                    {share
                      ? isFolder
                        ? "Anyone with the link can browse this folder and view its files."
                        : "Anyone with the link can view this file — no sign-in."
                      : isFolder
                        ? "Only people you invite can open this folder."
                        : "Only people you invite can open this file."}
                  </p>
                </div>
                {share && (
                  <span className="shrink-0 rounded-full bg-folder-bg px-2 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/15 ring-inset">
                    Viewer
                  </span>
                )}
              </div>

              {/* The link + its open stats appear only when access is public. */}
              {share && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={shareUrl(share.token)}
                      aria-label="Public link"
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
                  <p className="px-0.5 text-xs tabular-nums text-muted-foreground">
                    {share.openCount === 0
                      ? "Not opened yet"
                      : `Opened ${share.openCount} ${
                          share.openCount === 1 ? "time" : "times"
                        }${
                          share.lastOpenedAt
                            ? ` · last ${formatModified(share.lastOpenedAt)}`
                            : ""
                        }`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
