"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import type { DataroomPatch, Node } from "@/types";
import {
  compareNodes,
  createNode,
  getMyNodeAccess,
  getNode,
  isDuplicateNameError,
  leaveRoom,
  leaveSharedNode,
  listChildCounts,
  listRooms,
  listSharedWithMeNodes,
  reorderDatarooms,
  restoreNode,
  searchAllNodes,
  trashNode,
  updateDataroom,
  type SharedNodeEntry,
} from "@/lib/storage";
import { flySourcesFor, flyToTrash } from "@/lib/fly-to-trash";
import { useAsync } from "@/lib/hooks/use-async";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useMutation } from "@/lib/hooks/use-mutation";
import { useSearchHotkey } from "@/lib/hooks/use-search-hotkey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { DataroomGrid } from "@/components/dataroom-grid";
import type { DataroomListItem } from "@/components/dataroom-card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { SharedNodesSection } from "@/components/shared-nodes-section";
import { SearchResults } from "@/components/search-results";
import {
  DEFAULT_SEARCH_FILTER,
  SearchFilters,
  applySearchFilter,
  type SearchFilter,
} from "@/components/search-filters";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import {
  DataroomDialog,
  type DataroomValues,
} from "@/components/dataroom-dialog";
import { MembersDialog } from "@/components/members-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; room: Node }
  | { kind: "members"; room: Node };

/** The toolbar/CTA button is focused by its own click — capture it. */
const activeTrigger = () =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

async function loadRooms(): Promise<DataroomListItem[]> {
  // Exactly two requests regardless of how many rooms exist. listRooms
  // returns owned AND shared-with-me rooms, each with the caller's role.
  const rooms = await listRooms();
  const counts = await listChildCounts(rooms.map((r) => r.node.id));
  return rooms.map(({ node, access, memberCount }) => ({
    node,
    itemCount: counts.get(node.id) ?? 0,
    access,
    memberCount,
  }));
}

const sortItems = (items: DataroomListItem[]) =>
  [...items].sort((a, b) => compareNodes(a.node, b.node));

const HomeFallback = () => (
  <>
    <AppHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="mt-14">
        <ListSkeleton variant="cards" />
      </div>
    </main>
  </>
);

export default function HomePage() {
  return (
    <RequireAuth fallback={<HomeFallback />}>
      {/* Suspense: HomeView reads the ?q= search param. */}
      <Suspense fallback={<HomeFallback />}>
        <HomeView />
      </Suspense>
    </RequireAuth>
  );
}

function HomeView() {
  useDocumentTitle("Datarooms — Acme Corp. Dataroom");
  const { state, reload, setData } = useAsync(loadRooms, "datarooms");
  // Individual files/folders shared with me (separate from shared rooms).
  const sharedNodes = useAsync(listSharedWithMeNodes, "shared-nodes");
  const sharedNodeList =
    sharedNodes.state.status === "success" ? sharedNodes.state.data : [];
  const [leavingNodeId, setLeavingNodeId] = useState<string | null>(null);
  const handleLeaveNode = async (entry: SharedNodeEntry) => {
    setLeavingNodeId(entry.id);
    try {
      await leaveSharedNode(entry.id);
      sharedNodes.setData((list) => list.filter((n) => n.id !== entry.id));
      toast.success("You left", { description: entry.name });
    } catch {
      toast.error("Couldn't leave");
    } finally {
      setLeavingNodeId(null);
    }
  };

  // Global search across every dataroom — same URL/debounce contract as the
  // room search (?q= is the source of truth, 250ms debounce, / or Cmd+K).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useSearchHotkey(searchInputRef);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(() => query.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if ((params.get("q") ?? "") === debouncedQuery) return;
    if (debouncedQuery) params.set("q", debouncedQuery);
    else params.delete("q");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [debouncedQuery, pathname, router, searchParams]);
  const searching = debouncedQuery.length > 0;
  const search = useAsync(
    () => (searching ? searchAllNodes(debouncedQuery) : Promise.resolve([])),
    `search:all:${debouncedQuery}`,
  );
  const [searchFilter, setSearchFilter] = useState<SearchFilter>(
    DEFAULT_SEARCH_FILTER,
  );
  // Reset filters when leaving search — adjust-during-render, so the next
  // query never starts silently pre-filtered.
  const [wasSearching, setWasSearching] = useState(searching);
  if (wasSearching !== searching) {
    setWasSearching(searching);
    if (!searching) setSearchFilter(DEFAULT_SEARCH_FILTER);
  }
  const globalHits = useMemo(
    () => (search.state.status === "success" ? search.state.data : []),
    [search.state],
  );
  const filteredHits = useMemo(
    () => applySearchFilter(globalHits, searchFilter),
    [globalHits, searchFilter],
  );
  // "in Acme Deal › Contracts" — hits explain which room they live in.
  const displayHits = useMemo(
    () =>
      filteredHits.map((r) => ({
        ...r,
        parentName:
          r.node.type === "dataroom"
            ? r.parentName
            : r.node.parentId === r.roomId
              ? r.roomName
              : `${r.roomName} › ${r.parentName}`,
      })),
    [filteredHits],
  );
  const hitById = useMemo(
    () => new Map(globalHits.map((r) => [r.node.id, r])),
    [globalHits],
  );
  const openHitFolder = (node: Node) => {
    if (node.type === "dataroom") {
      router.push(`/room/${node.id}`);
      return;
    }
    const hit = hitById.get(node.id);
    if (hit) router.push(`/room/${hit.roomId}?folder=${node.id}`);
  };
  const openHitLocation = (parentId: string | null, node: Node) => {
    const hit = hitById.get(node.id);
    if (!hit) return;
    router.push(
      parentId && parentId !== hit.roomId
        ? `/room/${hit.roomId}?folder=${parentId}`
        : `/room/${hit.roomId}`,
    );
  };
  // File hits open right here — no detour into the room first.
  const [viewerFile, setViewerFile] = useState<Node | null>(null);
  const [viewerFind, setViewerFind] = useState<string | undefined>(undefined);
  const [viewerReturn, setViewerReturn] = useState<HTMLElement | null>(null);
  const openHitFile = (file: Node, trigger: HTMLElement | null) => {
    setViewerReturn(trigger);
    // Content hit → open jumped to the match.
    const hit = hitById.get(file.id);
    setViewerFind(hit?.contentMatch ? debouncedQuery : undefined);
    setViewerFile(file);
  };

  // A "/?shared=<id>" deep link (the link the owner hands invited people):
  // open the shared file in the viewer, or jump into the shared folder's room.
  // Access is enforced by RLS — an id the caller can't reach resolves to
  // nothing. The param is cleared so a refresh doesn't re-trigger it.
  const sharedParam = searchParams.get("shared");
  useEffect(() => {
    if (!sharedParam) return;
    let cancelled = false;
    void (async () => {
      const [node, access] = await Promise.all([
        getNode(sharedParam),
        getMyNodeAccess(sharedParam),
      ]);
      if (cancelled) return;
      // Always REPLACE the "?shared" entry with a single navigation — never
      // clear-then-push. A push leaves the "?shared" URL in history, so Back
      // re-fires this redirect and traps the visitor in a bounce loop.
      const params = new URLSearchParams(searchParams);
      params.delete("shared");
      const cleared = params.toString() ? `${pathname}?${params}` : pathname;
      if (!node || access === null) {
        router.replace(cleared, { scroll: false });
        toast.error("That shared item isn't available to you");
        return;
      }
      if (node.type === "file") {
        // Stay on home (behind the viewer), just drop the param.
        router.replace(cleared, { scroll: false });
        setViewerReturn(null);
        setViewerFind(undefined);
        setViewerFile(node);
      } else {
        router.replace(
          node.type === "dataroom" || !node.roomId
            ? `/room/${node.id}`
            : `/room/${node.roomId}?folder=${node.id}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sharedParam, searchParams, pathname, router]);

  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  // Frozen copy of the last real dialog: content renders from it while the
  // close animation plays; the gen key remounts fresh per open.
  const [shownDialog, setShownDialog] = useState<DialogState>({ kind: "none" });
  const [dialogGen, setDialogGen] = useState(0);
  if (dialog.kind !== "none" && shownDialog !== dialog) setShownDialog(dialog);
  const openDialog = (next: Exclude<DialogState, { kind: "none" }>) => {
    setDialogGen((g) => g + 1);
    setDialog(next);
  };
  // Survives close: dialogs read it in onCloseAutoFocus AFTER state resets.
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const closeDialog = () => setDialog({ kind: "none" });

  // Drag-to-reorder (owned rooms only): reflect the new order immediately
  // (with matching sort_order values so later create/edit re-sorts agree),
  // then persist. Shared-with-me rooms live in their own section untouched.
  const reorderRooms = (orderedIds: string[]) => {
    setData((items) => {
      const byId = new Map(items.map((it) => [it.node.id, it]));
      const reordered = orderedIds.flatMap((id, i) => {
        const it = byId.get(id);
        return it ? [{ ...it, node: { ...it.node, sortOrder: i + 1 } }] : [];
      });
      const rest = items.filter((it) => !orderedIds.includes(it.node.id));
      return [...reordered, ...rest];
    });
    void reorderDatarooms(orderedIds).catch(() => {
      toast.error("Couldn't save the new order");
      reload();
    });
  };

  /** The member's own exit from a shared room — the card leaves at once. */
  const leaveShared = useMutation((room: Node) => leaveRoom(room.id), {
    optimistic: (room) => {
      setData((items) => items.filter((i) => i.node.id !== room.id));
      return () => reload();
    },
    successToast: (_r) => "You left the dataroom",
    errorToast: () => "Couldn't leave the dataroom",
  });

  const createRoom = useMutation(
    (values: DataroomValues) => createNode({ type: "dataroom", ...values }),
    {
      successToast: "Dataroom created",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't create the dataroom",
      onSuccess: (node) => {
        setData((items) =>
          sortItems([
            ...items,
            { node, itemCount: 0, access: "owner", memberCount: 0 },
          ]),
        );
        // Belt for the cold path: if the initial list is still loading the
        // patch above has nothing to apply to — refetch post-commit so the
        // new card can never be missing.
        reload();
      },
    },
  );

  const editRoom = useMutation(
    (room: Node, patch: DataroomPatch) => updateDataroom(room.id, patch),
    {
      successToast: "Dataroom updated",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't update the dataroom",
      onSuccess: (updated) =>
        setData((items) =>
          sortItems(
            items.map((i) =>
              i.node.id === updated.id ? { ...i, node: updated } : i,
            ),
          ),
        ),
    },
  );

  /**
   * Moving to trash is reversible, so there's no confirm dialog: the card
   * disappears immediately and the toast carries Undo.
   */
  const trashRoom = useMutation((room: Node) => trashNode(room.id), {
    optimistic: (room) => {
      flyToTrash(flySourcesFor([room.id])); // before the card leaves the DOM
      setData((items) => items.filter((i) => i.node.id !== room.id));
      return () => reload(); // rollback: refetch the authoritative list
    },
    errorToast: () => "Couldn't move the dataroom to trash",
    onSuccess: (_result, room) => {
      // Deferred one tick: firing in the same commit as the closing kebab
      // menu's portal teardown gets the toast node swept away with it.
      setTimeout(() => {
        toast.success("Moved to trash", {
          description: room.name,
          action: {
            label: "Undo",
            onClick: () => {
              void restoreNode(room.id)
                .then(() => reload())
                .catch(() => toast.error("Couldn't restore it"));
            },
          },
        });
      }, 50);
    },
  });

  /** Dragging an item out of the trash stack onto a card restores it there. */
  const handleRestoreDrop = async (ids: string[], room: Node) => {
    let done = 0;
    for (const id of ids) {
      try {
        await restoreNode(id, room.id);
        done++;
      } catch {
        toast.error("Couldn't restore it");
        break;
      }
    }
    if (done > 0) {
      reload();
      toast.success(
        done === 1
          ? `Restored to ${room.name}`
          : `${done} items restored to ${room.name}`,
      );
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="font-heading text-2xl font-medium tracking-[-0.01em]">
            Datarooms
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  if (query) {
                    setQuery("");
                    e.stopPropagation();
                  } else {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Search all datarooms"
                aria-label="Search all datarooms"
                className="w-56 pl-8 pr-8"
              />
              {query.length === 0 && (
                <kbd
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-2 hidden h-5 -translate-y-1/2 items-center rounded border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground sm:flex pointer-coarse:hidden"
                >
                  /
                </kbd>
              )}
              {query.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-[color,background-color] duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/70 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {/* The empty state carries its own CTA — never two primary
                "Create dataroom" buttons on one screen. */}
            {!(state.status === "success" && state.data.length === 0) && (
              <Button
                onClick={() => {
                  setReturnTo(activeTrigger());
                  openDialog({ kind: "create" });
                }}
              >
                <Plus /> Create dataroom
              </Button>
            )}
          </div>
        </div>
        <section
          key={searching ? "search" : "grid"}
          className={`mt-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 ${
            searching && search.isStale ? "opacity-60" : "opacity-100"
          }`}
        >
          {searching ? (
            <>
              {search.state.status === "loading" && (
                <ListSkeleton variant="rows" count={3} />
              )}
              {search.state.status === "error" && (
                <ErrorState onRetry={search.reload} />
              )}
              {search.state.status === "success" &&
                (search.state.data.length === 0 ? (
                  <EmptyState variant="no-results" query={debouncedQuery} />
                ) : (
                  <>
                    <div className="mb-2 flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <p role="status" className="text-xs text-muted-foreground">
                        {filteredHits.length === search.state.data.length
                          ? search.state.data.length === 1
                            ? "1 result"
                            : `${search.state.data.length} results`
                          : `${filteredHits.length} of ${search.state.data.length} results`}{" "}
                        for &ldquo;{debouncedQuery}&rdquo; in all datarooms
                      </p>
                      <SearchFilters
                        value={searchFilter}
                        onChange={setSearchFilter}
                        hasContentMatches={search.state.data.some(
                          (r) => r.contentMatch,
                        )}
                      />
                    </div>
                    {filteredHits.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 rounded-card border bg-card px-6 py-10 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                        <p className="text-sm text-muted-foreground">
                          No results match these filters.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchFilter(DEFAULT_SEARCH_FILTER)}
                        >
                          Reset filters
                        </Button>
                      </div>
                    ) : (
                      <SearchResults
                        results={displayHits}
                        query={debouncedQuery}
                        onOpenFolder={openHitFolder}
                        onOpenFile={openHitFile}
                        onOpenLocation={openHitLocation}
                      />
                    )}
                  </>
                ))}
            </>
          ) : (
            <>
              {state.status === "loading" && <ListSkeleton variant="cards" />}
              {state.status === "error" && <ErrorState onRetry={reload} />}
              {state.status === "success" &&
                (() => {
                  const owned = state.data.filter(
                    (it) => it.access === "owner",
                  );
                  const shared = state.data.filter(
                    (it) => it.access !== "owner",
                  );
                  if (
                    owned.length === 0 &&
                    shared.length === 0 &&
                    sharedNodeList.length === 0
                  ) {
                    return (
                      <EmptyState
                        variant="no-datarooms"
                        action={
                          <Button
                            onClick={() => {
                              setReturnTo(activeTrigger());
                              openDialog({ kind: "create" });
                            }}
                          >
                            <Plus /> Create dataroom
                          </Button>
                        }
                      />
                    );
                  }
                  return (
                    <>
                      {owned.length > 0 && (
                        <DataroomGrid
                          items={owned}
                          onEdit={(room, trigger) => {
                            setReturnTo(trigger);
                            openDialog({ kind: "edit", room });
                          }}
                          onDelete={(room) =>
                            void trashRoom.run(room).catch(() => {})
                          }
                          onManageAccess={(room, trigger) => {
                            setReturnTo(trigger);
                            openDialog({ kind: "members", room });
                          }}
                          onDropRestore={(ids, room) =>
                            void handleRestoreDrop(ids, room)
                          }
                          onReorder={reorderRooms}
                        />
                      )}
                      {shared.length > 0 && (
                        <div className={owned.length > 0 ? "mt-8" : undefined}>
                          {/* The ledger register, same as table headers —
                              these rooms belong to someone else. */}
                          <h2 className="mb-3 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
                            Shared with you
                          </h2>
                          <DataroomGrid
                            items={shared}
                            onLeave={(room) =>
                              void leaveShared.run(room).catch(() => {})
                            }
                          />
                        </div>
                      )}
                      {sharedNodeList.length > 0 && (
                        <div
                          className={
                            owned.length > 0 || shared.length > 0
                              ? "mt-8"
                              : undefined
                          }
                        >
                          <h2 className="mb-3 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
                            Files &amp; folders shared with you
                          </h2>
                          <SharedNodesSection
                            entries={sharedNodeList}
                            onLeave={(entry) => void handleLeaveNode(entry)}
                            leavingId={leavingNodeId}
                          />
                        </div>
                      )}
                    </>
                  );
                })()}
            </>
          )}
        </section>
      </main>

      <PdfViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
        returnFocusTo={viewerReturn}
        initialFind={viewerFind}
      />

      <MembersDialog
        key={`members-${dialogGen}`}
        room={dialog.kind === "members" ? dialog.room : null}
        onClose={closeDialog}
        returnFocusTo={returnTo}
      />

      <DataroomDialog
        key={`room-${dialogGen}`}
        open={dialog.kind === "create" || dialog.kind === "edit"}
        mode={shownDialog.kind === "edit" ? "edit" : "create"}
        initial={
          shownDialog.kind === "edit"
            ? {
                name: shownDialog.room.name,
                description: shownDialog.room.description ?? null,
                icon: shownDialog.room.icon ?? null,
                color: shownDialog.room.color ?? null,
              }
            : undefined
        }
        onSubmit={async (values) => {
          if (dialog.kind === "edit") await editRoom.run(dialog.room, values);
          else await createRoom.run(values);
        }}
        onClose={closeDialog}
        returnFocusTo={returnTo}
      />
    </>
  );
}
