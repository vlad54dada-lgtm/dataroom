"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Link2,
  Loader2,
  Mail,
  UserPlus,
  X,
} from "lucide-react";
import type { Node } from "@/types";
import {
  InvalidNameError,
  inviteMember,
  isDuplicateInviteError,
  listRoomMembers,
  removeMember,
  setMemberRole,
  type RoomMember,
} from "@/lib/storage";
import { shake } from "@/lib/shake";
import { cn, siteOrigin } from "@/lib/utils";
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

interface MembersDialogProps {
  /** The dataroom whose access is being managed; null when closed. */
  room: Node | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

const ROLE_LABEL = { viewer: "Viewer", editor: "Editor" } as const;
const ROLE_HINT = {
  viewer: "Can view and download everything",
  editor: "Can add, edit, and organize content",
} as const;

// Settled member list for one room; "loading" is derived (no settled state
// for the current room yet), so the effect never sets state synchronously.
type MembersState =
  | { roomId: string; status: "ready"; members: RoomMember[] }
  | { roomId: string; status: "error" };

/**
 * The dataroom's access settings (owner-only entry points): invite people by
 * email with a viewer/editor role, change roles, remove members. Invitees
 * without an account sign up with the invited email — the "Copy invite link"
 * lands them in the room right after (login?next=). No emails are sent; the
 * owner shares the link themselves.
 */
export function MembersDialog({
  room,
  onClose,
  returnFocusTo,
}: MembersDialogProps) {
  // Held past close so content doesn't blank mid-exit (adjust-during-render).
  const [shownRoom, setShownRoom] = useState<Node | null>(room);
  if (room && room !== shownRoom) setShownRoom(room);
  const shown = room ?? shownRoom;

  const [settled, setSettled] = useState<MembersState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  // Which member row has a mutation in flight (role change / removal).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    listRoomMembers(room.id).then(
      (members) => {
        if (!cancelled)
          setSettled({ roomId: room.id, status: "ready", members });
      },
      () => {
        if (!cancelled) setSettled({ roomId: room.id, status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [room, reloadKey]);

  const current = settled && settled.roomId === shown?.id ? settled : null;
  const loading = room !== null && current === null;
  const members = current?.status === "ready" ? current.members : [];

  const patchMembers = (updater: (prev: RoomMember[]) => RoomMember[]) => {
    setSettled((prev) =>
      prev && prev.status === "ready"
        ? { ...prev, members: updater(prev.members) }
        : prev,
    );
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inviting || !shown) return;
    setError(null);
    try {
      setInviting(true);
      const member = await inviteMember(shown.id, email, role);
      patchMembers((prev) => [...prev, member]);
      setEmail("");
      toast.success("Invitation added", { description: member.email });
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
        toast.error("Couldn't add the invitation");
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRole = async (member: RoomMember, next: "viewer" | "editor") => {
    if (member.role === next) return;
    setBusyId(member.id);
    const prevRole = member.role;
    patchMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: next } : m)),
    );
    try {
      await setMemberRole(member.id, next);
      toast.success(`${member.email} is now ${next === "editor" ? "an editor" : "a viewer"}`);
    } catch {
      patchMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: prevRole } : m)),
      );
      toast.error("Couldn't change the role");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (member: RoomMember) => {
    setBusyId(member.id);
    try {
      await removeMember(member.id);
      patchMembers((prev) => prev.filter((m) => m.id !== member.id));
      toast.success("Access removed", { description: member.email });
    } catch {
      toast.error("Couldn't remove access");
    } finally {
      setBusyId(null);
    }
  };

  const copyInviteLink = async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(
        `${siteOrigin()}/login?next=${encodeURIComponent(
          `/room/${shown.id}`,
        )}`,
      );
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  return (
    <Dialog
      open={room !== null}
      onOpenChange={(next) => {
        if (!next && (inviting || busyId !== null)) return;
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreFocus}>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Manage access</DialogTitle>
          <DialogDescription className="truncate">
            {shown?.name}
          </DialogDescription>
        </DialogHeader>

        {/* Invite form: email + role chips + add. Always-pressable submit —
            invalid input answers with a shake and an inline error. */}
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
          {/* Role chips — the same toggle language as the search filters. */}
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
        </form>

        {/* Member list */}
        {loading ? (
          <div className="divide-y overflow-hidden rounded-card border">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex h-13 items-center gap-3 px-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : current?.status === "error" ? (
          <div className="flex flex-col items-center gap-3 rounded-card border px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load the member list.
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
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-card border px-6 py-8 text-center">
            <p className="text-sm font-medium">Only you have access</p>
            <p className="text-sm text-muted-foreground">
              Invite someone by email — they&apos;ll see this dataroom after
              they sign in with it.
            </p>
          </div>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto rounded-card border">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-folder-bg text-sm font-semibold text-brand ring-1 ring-brand/15 ring-inset">
                  {member.email.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="flex items-center gap-2 truncate text-sm font-medium"
                    title={member.email}
                  >
                    <span className="truncate">{member.email}</span>
                    {member.pending && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
                        Pending
                      </span>
                    )}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={busyId !== null}
                      aria-label={`Role for ${member.email}`}
                    >
                      {busyId === member.id ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      {ROLE_LABEL[member.role]}
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuRadioGroup
                      value={member.role}
                      onValueChange={(value) =>
                        void handleRole(member, value as "viewer" | "editor")
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.email}`}
                  title="Remove access"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={busyId !== null}
                  onClick={() => void handleRemove(member)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Getting the invitee here: no emails are sent from a client-only
            app — the owner passes the link along. */}
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">
              Invitees sign in with the invited email
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void copyInviteLink()}
          >
            {linkCopied ? <Check /> : <Link2 />}
            {linkCopied ? "Copied" : "Copy invite link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
