"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Globe, Lock, Users } from "lucide-react";
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

/** A small on/off toggle for the public link (no shadcn switch in the stack). */
function Toggle({
  checked,
  onToggle,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-brand" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/**
 * One collapsible access panel: an icon + title + summary header (click to
 * expand), an optional trailing control (the public toggle), and a body that
 * reveals on expand. When `disabled` (the file is already public), the panel
 * greys out, shows a lock instead of the chevron, and can't be expanded.
 */
function AccessPanel({
  icon,
  iconClass,
  title,
  summary,
  open,
  onToggle,
  disabled,
  trailing,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const expanded = open && !disabled;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border transition-opacity",
        disabled && "opacity-55",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-tile ring-1 ring-inset transition-colors",
            iconClass,
          )}
        >
          {icon}
        </span>
        <button
          type="button"
          onClick={disabled ? undefined : onToggle}
          disabled={disabled}
          aria-expanded={disabled ? undefined : expanded}
          className="min-w-0 flex-1 rounded-sm py-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-default"
        >
          <p className="text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{summary}</p>
        </button>
        {trailing}
        {disabled ? (
          <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse section" : "Expand section"}
            className="shrink-0 rounded-sm p-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/70"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      <div className={cn("border-t px-3 py-3", !expanded && "hidden")}>
        {children}
      </div>
    </div>
  );
}

/**
 * Sharing settings for a file or folder — two collapsible panels for one
 * coherent policy:
 *   • "People with access" — specific people invited by email (viewer/editor).
 *     It LOCKS (greys out) while the file is public, because anyone with the
 *     link can already view it; turning the link off re-opens it.
 *   • "Anyone with the link" — a switch that mints/revokes a view-only public
 *     link; expand it for the link itself + open stats.
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
  // Both collapsed on open: the dialog reads as a compact two-row overview;
  // expanding a panel is what mounts its (async) contents.
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

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
  const isPublic = share !== null;

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
      toast.success("Link turned off", { description: shown.name });
    } catch {
      toast.error("Couldn't change access");
    } finally {
      setBusy(false);
    }
  };

  // The switch mints or revokes the view-only public link.
  const togglePublic = () => {
    if (busy || !shown) return;
    if (isPublic) void handleRevoke();
    else void handleCreate();
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

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-[4.25rem] w-full rounded-card" />
            <Skeleton className="h-[4.25rem] w-full rounded-card" />
          </div>
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
            {/* People with access — locks while the file is public, since
                anyone with the link can already view it. */}
            <AccessPanel
              icon={<Users className="size-5" strokeWidth={1.75} />}
              iconClass="bg-muted text-muted-foreground ring-border"
              title="People with access"
              summary={
                isPublic
                  ? `Turn off the link to invite specific people to this ${
                      isFolder ? "folder" : "file"
                    }.`
                  : "Invite specific people by email."
              }
              open={peopleOpen}
              onToggle={() => setPeopleOpen((o) => !o)}
              disabled={isPublic}
            >
              {/* Mounted only when expanded — no grants fetch until opened. */}
              {shown && peopleOpen && !isPublic && (
                <PeopleWithAccess key={shown.id} node={shown} />
              )}
            </AccessPanel>

            {/* Anyone with the link — the switch mints/revokes a view-only
                public link; expand for the link + its open stats. */}
            <AccessPanel
              icon={
                isPublic ? (
                  <Globe className="size-5" strokeWidth={1.75} />
                ) : (
                  <Lock className="size-5" strokeWidth={1.75} />
                )
              }
              iconClass={
                isPublic
                  ? "bg-folder-bg text-brand ring-brand/20"
                  : "bg-muted text-muted-foreground ring-border"
              }
              title="Anyone with the link"
              summary={
                isPublic
                  ? "On · anyone with the link can view (view only)"
                  : "Off · only invited people can open it"
              }
              open={linkOpen}
              onToggle={() => setLinkOpen((o) => !o)}
              trailing={
                <Toggle
                  checked={isPublic}
                  onToggle={togglePublic}
                  disabled={busy}
                  label="Public link"
                />
              }
            >
              {isPublic && share ? (
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Turn on the switch to create a link{" "}
                  {isFolder
                    ? "anyone can open to browse this folder"
                    : "anyone can open to view this file"}{" "}
                  — view only, no sign-in.
                </p>
              )}
            </AccessPanel>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
