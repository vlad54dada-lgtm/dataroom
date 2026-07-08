"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Folder,
  Link2,
  Loader2,
  LogOut,
  X,
} from "lucide-react";
import {
  leaveRoom,
  leaveSharedNode,
  listMyRoomMembers,
  listMyShares,
  listRooms,
  listSharedWithMeNodes,
  removeMember,
  revokeShare,
  setMemberRole,
  type MyShareLink,
  type RoomListEntry,
  type RoomMembersGroup,
  type SharedNodeEntry,
} from "@/lib/storage";
import { formatDate, formatModified, siteOrigin } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { RoomAvatar } from "@/components/room-avatar";
import { SharedNodesSection } from "@/components/shared-nodes-section";

interface AccessData {
  links: MyShareLink[];
  memberGroups: RoomMembersGroup[];
  sharedWithMe: RoomListEntry[];
  sharedNodes: SharedNodeEntry[];
}

async function loadAccess(): Promise<AccessData> {
  const [links, memberGroups, rooms, sharedNodes] = await Promise.all([
    listMyShares(),
    listMyRoomMembers(),
    listRooms(),
    listSharedWithMeNodes(),
  ]);
  return {
    links,
    memberGroups,
    sharedWithMe: rooms.filter((r) => r.access !== "owner"),
    sharedNodes,
  };
}

const ROLE_LABEL = { viewer: "Viewer", editor: "Editor" } as const;

/** Ledger-caps section heading, same register as table headers. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
      {children}
    </h2>
  );
}

export default function AccessPage() {
  return (
    <RequireAuth>
      <AccessView />
    </RequireAuth>
  );
}

function AccessView() {
  useDocumentTitle("Sharing & access — Acme Corp. Dataroom");
  const router = useRouter();
  const { state, reload, setData } = useAsync(loadAccess, "access");

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  // One in-flight mutation at a time keeps the optimistic patches honest.
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const copyLink = async (link: MyShareLink) => {
    try {
      await navigator.clipboard.writeText(
        `${siteOrigin()}/share/${link.token}`,
      );
      setCopiedToken(link.token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const handleRevoke = async (link: MyShareLink) => {
    setBusyKey(`link:${link.token}`);
    try {
      await revokeShare(link.nodeId);
      setData((d) => ({
        ...d,
        links: d.links.filter((l) => l.token !== link.token),
      }));
      toast.success("Sharing turned off", { description: link.nodeName });
    } catch {
      toast.error("Couldn't stop sharing");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRole = async (
    groupId: string,
    memberId: string,
    email: string,
    role: "viewer" | "editor",
  ) => {
    setBusyKey(`member:${memberId}`);
    try {
      await setMemberRole(memberId, role);
      setData((d) => ({
        ...d,
        memberGroups: d.memberGroups.map((g) =>
          g.roomId === groupId
            ? {
                ...g,
                members: g.members.map((m) =>
                  m.id === memberId ? { ...m, role } : m,
                ),
              }
            : g,
        ),
      }));
      toast.success(
        `${email} is now ${role === "editor" ? "an editor" : "a viewer"}`,
      );
    } catch {
      toast.error("Couldn't change the role");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemove = async (groupId: string, memberId: string, email: string) => {
    setBusyKey(`member:${memberId}`);
    try {
      await removeMember(memberId);
      setData((d) => ({
        ...d,
        memberGroups: d.memberGroups
          .map((g) =>
            g.roomId === groupId
              ? { ...g, members: g.members.filter((m) => m.id !== memberId) }
              : g,
          )
          .filter((g) => g.members.length > 0),
      }));
      toast.success("Access removed", { description: email });
    } catch {
      toast.error("Couldn't remove access");
    } finally {
      setBusyKey(null);
    }
  };

  const handleLeave = async (entry: RoomListEntry) => {
    setBusyKey(`leave:${entry.node.id}`);
    try {
      await leaveRoom(entry.node.id);
      setData((d) => ({
        ...d,
        sharedWithMe: d.sharedWithMe.filter(
          (r) => r.node.id !== entry.node.id,
        ),
      }));
      toast.success("You left the dataroom", { description: entry.node.name });
    } catch {
      toast.error("Couldn't leave the dataroom");
    } finally {
      setBusyKey(null);
    }
  };

  const handleLeaveNode = async (entry: SharedNodeEntry) => {
    setBusyKey(`leave-node:${entry.id}`);
    try {
      await leaveSharedNode(entry.id);
      setData((d) => ({
        ...d,
        sharedNodes: d.sharedNodes.filter((n) => n.id !== entry.id),
      }));
      toast.success("You left", { description: entry.name });
    } catch {
      toast.error("Couldn't leave");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <AppHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 scroll-mt-14 px-6 py-8 outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            className="text-muted-foreground"
            onClick={() => router.back()}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-medium tracking-[-0.01em]">
              Sharing &amp; access
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every link you&apos;ve shared and every person you&apos;ve
              invited, in one place.
            </p>
          </div>
        </div>

        <section className="mt-6">
          {state.status === "loading" && <ListSkeleton variant="rows" count={4} />}
          {state.status === "error" && <ErrorState onRetry={reload} />}
          {state.status === "success" &&
            (state.data.links.length === 0 &&
            state.data.memberGroups.length === 0 &&
            state.data.sharedWithMe.length === 0 &&
            state.data.sharedNodes.length === 0 ? (
              <EmptyState variant="no-shares" />
            ) : (
              <div className="space-y-8">
                {/* ------------------------------------------------ links */}
                {state.data.links.length > 0 && (
                  <div className="space-y-3">
                    <SectionHeading>Public links</SectionHeading>
                    <div className="overflow-hidden rounded-card border bg-card">
                      <div className="flex h-9 items-center gap-3 border-b bg-foreground/3 px-4 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
                        <span className="flex-1">Name</span>
                        <span className="hidden w-36 lg:block">Location</span>
                        <span className="hidden w-24 text-right md:block">
                          Opens
                        </span>
                        <span className="hidden w-36 md:block">
                          Last opened
                        </span>
                        <span className="w-32 text-right">
                          <span className="sr-only">Actions</span>
                        </span>
                      </div>
                      <ul className="divide-y">
                        {state.data.links.map((link) => {
                          const isFolder = link.nodeType === "folder";
                          return (
                            <li
                              key={link.token}
                              className={`flex items-center gap-3 px-4 py-2.5 ${
                                link.active ? "" : "opacity-50"
                              }`}
                            >
                              <span
                                className={`flex size-8 shrink-0 items-center justify-center rounded-tile ring-1 ring-inset ${
                                  isFolder
                                    ? "bg-folder-bg ring-folder/15"
                                    : "bg-file-bg ring-file/15"
                                }`}
                              >
                                {isFolder ? (
                                  <Folder
                                    className="size-5 fill-folder/10 text-folder"
                                    strokeWidth={1.75}
                                  />
                                ) : (
                                  <FileText
                                    className="size-5 fill-file/10 text-file"
                                    strokeWidth={1.75}
                                  />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className="block truncate text-sm font-medium"
                                  title={link.nodeName}
                                >
                                  {link.nodeName}
                                  {!link.active && (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                      In trash
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-xs tabular-nums text-muted-foreground lg:hidden">
                                  {link.roomName ?? ""}
                                  {link.roomName ? " · " : ""}
                                  {link.openCount === 0
                                    ? "Not opened"
                                    : `${link.openCount} ${
                                        link.openCount === 1 ? "open" : "opens"
                                      }`}
                                </span>
                              </span>
                              <span
                                className="hidden w-36 shrink-0 truncate text-sm text-muted-foreground lg:block"
                                title={link.roomName ?? undefined}
                              >
                                {link.roomName ?? "—"}
                              </span>
                              <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground md:block">
                                {link.openCount}
                              </span>
                              <span className="hidden w-36 shrink-0 text-sm tabular-nums text-muted-foreground md:block">
                                {link.lastOpenedAt
                                  ? formatModified(link.lastOpenedAt)
                                  : "—"}
                              </span>
                              <span className="flex w-32 shrink-0 items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Copy link to ${link.nodeName}`}
                                  title="Copy link"
                                  className="text-muted-foreground"
                                  onClick={() => void copyLink(link)}
                                >
                                  {copiedToken === link.token ? (
                                    <Check />
                                  ) : (
                                    <Copy />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={busyKey !== null}
                                  onClick={() => void handleRevoke(link)}
                                >
                                  {busyKey === `link:${link.token}` ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <Link2 />
                                  )}
                                  Revoke
                                </Button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------- members */}
                {state.data.memberGroups.length > 0 && (
                  <div className="space-y-3">
                    <SectionHeading>Dataroom members</SectionHeading>
                    <div className="space-y-4">
                      {state.data.memberGroups.map((group) => (
                        <div
                          key={group.roomId}
                          className="overflow-hidden rounded-card border bg-card"
                        >
                          <Link
                            href={`/room/${group.roomId}`}
                            className="flex items-center gap-2.5 border-b bg-foreground/3 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-foreground/6 focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-inset"
                          >
                            <RoomAvatar
                              icon={group.roomIcon}
                              color={group.roomColor}
                              size="sm"
                              className="size-6 rounded-md"
                            />
                            <span className="truncate text-sm font-medium">
                              {group.roomName}
                            </span>
                            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                              {group.members.length}{" "}
                              {group.members.length === 1
                                ? "person"
                                : "people"}
                            </span>
                          </Link>
                          <ul className="divide-y">
                            {group.members.map((member) => (
                              <li
                                key={member.id}
                                className="flex items-center gap-3 px-4 py-2.5"
                              >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-folder-bg text-sm font-semibold text-brand ring-1 ring-brand/15 ring-inset">
                                  {member.email.charAt(0).toUpperCase()}
                                </span>
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                  <span
                                    className="truncate text-sm font-medium"
                                    title={member.email}
                                  >
                                    {member.email}
                                  </span>
                                  {member.pending && (
                                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
                                      Pending
                                    </span>
                                  )}
                                </span>
                                <span className="hidden w-36 shrink-0 text-sm tabular-nums text-muted-foreground sm:block">
                                  Invited {formatDate(member.createdAt)}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0 gap-1"
                                      disabled={busyKey !== null}
                                      aria-label={`Role for ${member.email}`}
                                    >
                                      {busyKey === `member:${member.id}` ? (
                                        <Loader2 className="animate-spin" />
                                      ) : null}
                                      {ROLE_LABEL[member.role]}
                                      <ChevronDown className="size-3.5 text-muted-foreground" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                  >
                                    <DropdownMenuRadioGroup
                                      value={member.role}
                                      onValueChange={(value) =>
                                        void handleRole(
                                          group.roomId,
                                          member.id,
                                          member.email,
                                          value as "viewer" | "editor",
                                        )
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
                                  disabled={busyKey !== null}
                                  onClick={() =>
                                    void handleRemove(
                                      group.roomId,
                                      member.id,
                                      member.email,
                                    )
                                  }
                                >
                                  <X />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ---------------------------------------- shared with me */}
                {state.data.sharedWithMe.length > 0 && (
                  <div className="space-y-3">
                    <SectionHeading>Shared with you</SectionHeading>
                    <div className="overflow-hidden rounded-card border bg-card">
                      <ul className="divide-y">
                        {state.data.sharedWithMe.map((entry) => (
                          <li
                            key={entry.node.id}
                            className="flex items-center gap-3 px-4 py-2.5"
                          >
                            <RoomAvatar
                              icon={entry.node.icon}
                              color={entry.node.color}
                              size="sm"
                              className="size-8"
                            />
                            <Link
                              href={`/room/${entry.node.id}`}
                              className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/70"
                              title={entry.node.name}
                            >
                              {entry.node.name}
                            </Link>
                            <span className="shrink-0 rounded-full bg-folder-bg px-2 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/15 ring-inset">
                              {entry.access === "editor" ? "Editor" : "Viewer"}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={busyKey !== null}
                              onClick={() => void handleLeave(entry)}
                            >
                              {busyKey === `leave:${entry.node.id}` ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <LogOut />
                              )}
                              Leave
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* --------------------------- files & folders shared with me */}
                {state.data.sharedNodes.length > 0 && (
                  <div className="space-y-3">
                    <SectionHeading>Files &amp; folders shared with you</SectionHeading>
                    <SharedNodesSection
                      entries={state.data.sharedNodes}
                      onLeave={(entry) => void handleLeaveNode(entry)}
                      leavingId={
                        busyKey?.startsWith("leave-node:")
                          ? busyKey.slice("leave-node:".length)
                          : null
                      }
                    />
                  </div>
                )}
              </div>
            ))}
        </section>
      </main>
    </>
  );
}
