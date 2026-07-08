"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Loader2, UserPlus, X } from "lucide-react";
import type { Node } from "@/types";
import {
  InvalidNameError,
  inviteToNode,
  isDuplicateInviteError,
  listNodeGrants,
  removeNodeGrant,
  setNodeGrantRole,
  type NodeGrant,
} from "@/lib/storage";
import { shake } from "@/lib/shake";
import { cn, siteOrigin } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PeopleWithAccessProps {
  /** The file or folder whose grants are managed. */
  node: Node;
}

const ROLE_LABEL = { viewer: "Viewer", editor: "Editor" } as const;
const ROLE_HINT = {
  viewer: "Can view and download",
  editor: "Can add, edit, and organize",
} as const;

// Settled grant list for one node; "loading" is derived (no settled state for
// the current node yet), so the effect never sets state synchronously.
type GrantsState =
  | { nodeId: string; status: "ready"; grants: NodeGrant[] }
  | { nodeId: string; status: "error" };

/**
 * The "People with access" block of the Share dialog: invite specific people
 * by email to a single file/folder with a viewer/editor role, change roles,
 * remove. Mirrors the dataroom MembersDialog, scoped to one node. Owner-only —
 * the whole Share dialog is gated by canManage before it opens.
 */
export function PeopleWithAccess({ node }: PeopleWithAccessProps) {
  // A shared FILE is view-only: it has nothing to organize and no in-app edit
  // surface, so "editor" would be tamper-only. Editor is a folder-grant concept.
  const isFile = node.type === "file";
  const [settled, setSettled] = useState<GrantsState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNodeGrants(node.id).then(
      (grants) => {
        if (!cancelled)
          setSettled({ nodeId: node.id, status: "ready", grants });
      },
      () => {
        if (!cancelled) setSettled({ nodeId: node.id, status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [node.id, reloadKey]);

  const current = settled && settled.nodeId === node.id ? settled : null;
  const loading = current === null;
  const grants = current?.status === "ready" ? current.grants : [];

  const patch = (updater: (prev: NodeGrant[]) => NodeGrant[]) =>
    setSettled((prev) =>
      prev && prev.status === "ready"
        ? { ...prev, grants: updater(prev.grants) }
        : prev,
    );

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inviting) return;
    setError(null);
    try {
      setInviting(true);
      const grant = await inviteToNode(node.id, email, role);
      patch((prev) => [...prev, grant]);
      setEmail("");
      toast.success("Access granted", { description: grant.email });
      inputRef.current?.focus();
    } catch (err) {
      const message =
        err instanceof InvalidNameError
          ? err.message
          : isDuplicateInviteError(err)
            ? err.message
            : null;
      if (message) {
        setError(message);
        shake(inputRef.current);
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        toast.error("Couldn't grant access");
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRole = async (grant: NodeGrant, next: "viewer" | "editor") => {
    if (grant.role === next) return;
    setBusyId(grant.id);
    const prevRole = grant.role;
    patch((prev) =>
      prev.map((g) => (g.id === grant.id ? { ...g, role: next } : g)),
    );
    try {
      await setNodeGrantRole(grant.id, next);
      toast.success(
        `${grant.email} is now ${next === "editor" ? "an editor" : "a viewer"}`,
      );
    } catch {
      patch((prev) =>
        prev.map((g) => (g.id === grant.id ? { ...g, role: prevRole } : g)),
      );
      toast.error("Couldn't change the role");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (grant: NodeGrant) => {
    setBusyId(grant.id);
    try {
      await removeNodeGrant(grant.id);
      patch((prev) => prev.filter((g) => g.id !== grant.id));
      toast.success("Access removed", { description: grant.email });
    } catch {
      toast.error("Couldn't remove access");
    } finally {
      setBusyId(null);
    }
  };

  // The link to hand invited people (access is still gated by the grant — a
  // stranger who opens it gets nothing). Folders deep-link STRAIGHT to the
  // room, so there is no home redirect to loop on; files (no room-browse URL)
  // resolve through the home "?shared" handler.
  const copyLink = async () => {
    const url =
      node.type === "file"
        ? `${siteOrigin()}/file/${node.id}`
        : node.roomId
          ? `${siteOrigin()}/room/${node.roomId}?folder=${node.id}`
          : `${siteOrigin()}/?shared=${node.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="space-y-3">
      {/* Invite form — always-pressable submit + shake on invalid input. */}
      <form onSubmit={(e) => void handleInvite(e)} className="space-y-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="name@company.com"
              aria-label="Email to invite"
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {error && (
              <p
                role="alert"
                className="mt-1.5 text-sm text-danger motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
              >
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="shrink-0" disabled={inviting}>
            {inviting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Invite
          </Button>
        </div>
        {isFile ? (
          <p className="text-xs text-muted-foreground">
            People you add can view and download this file.
          </p>
        ) : (
          <div
            role="group"
            aria-label="Role for the invitation"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(["viewer", "editor"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                title={ROLE_HINT[r]}
                onClick={() => setRole(r)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/70",
                  role === r
                    ? "border-brand/30 bg-folder-bg text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">
              {ROLE_HINT[role]}
            </span>
          </div>
        )}
      </form>

      {/* Grant list */}
      {loading ? (
        <div className="divide-y overflow-hidden rounded-card border">
          {Array.from({ length: 1 }, (_, i) => (
            <div key={i} className="flex h-12 items-center gap-3 px-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : current?.status === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-card border px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load who has access.
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
      ) : grants.length === 0 ? (
        <p className="rounded-card border px-3 py-3 text-sm text-muted-foreground">
          No one has been invited yet.
        </p>
      ) : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-card border">
          {grants.map((grant) => (
            <li
              key={grant.id}
              className="flex items-center gap-3 px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-folder-bg text-sm font-semibold text-brand ring-1 ring-brand/15 ring-inset">
                {grant.email.charAt(0).toUpperCase()}
              </span>
              <p
                className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-medium"
                title={grant.email}
              >
                <span className="truncate">{grant.email}</span>
                {grant.pending && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
                    Pending
                  </span>
                )}
              </p>
              {isFile ? (
                // A file grant is always viewer — no role to switch.
                <span className="shrink-0 rounded-full bg-folder-bg px-2.5 py-1 text-xs font-medium text-brand ring-1 ring-brand/15 ring-inset">
                  Viewer
                </span>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={busyId !== null}
                      aria-label={`Role for ${grant.email}`}
                    >
                      {busyId === grant.id ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      {ROLE_LABEL[grant.role]}
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuRadioGroup
                      value={grant.role}
                      onValueChange={(value) =>
                        void handleRole(grant, value as "viewer" | "editor")
                      }
                    >
                      <DropdownMenuRadioItem value="viewer">
                        Viewer
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="editor">
                        Editor
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${grant.email}`}
                title="Remove access"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={busyId !== null}
                onClick={() => void handleRemove(grant)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* The link to send the people invited above. */}
      {grants.length > 0 && (
        <div className="flex items-center gap-2 rounded-card border bg-muted/30 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Send invited people this link — it opens once they sign in with the
            invited email.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void copyLink()}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </div>
  );
}
