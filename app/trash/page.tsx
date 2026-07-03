"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { DeleteCounts, Node } from "@/types";
import {
  emptyTrash,
  getDeleteCounts,
  listChildren,
  listTrash,
  purgeNode,
  restoreNode,
  searchTrash,
  type TrashItem,
  type TrashSearchResult,
} from "@/lib/storage";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useMutation } from "@/lib/hooks/use-mutation";
import { useSearchHotkey } from "@/lib/hooks/use-search-hotkey";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { RoomAvatar } from "@/components/room-avatar";
import { DeleteDialog } from "@/components/delete-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { MoveDialog } from "@/components/move-dialog";
import { TRASH_RETURN_KEY } from "@/components/trash-fab";

type ConfirmState =
  | { kind: "none" }
  | { kind: "purge"; node: Node; counts: DeleteCounts | null }
  | { kind: "purgeMany"; nodes: Node[] }
  | { kind: "restoreTo"; nodes: Node[] }
  // counts = everything INSIDE deleted folders, fetched after opening.
  | { kind: "empty"; counts: DeleteCounts | null };

export default function TrashPage() {
  return (
    <RequireAuth>
      <TrashView />
    </RequireAuth>
  );
}

function TrashView() {
  const router = useRouter();
  useDocumentTitle("Trash — Acme Corp. Data Room");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useSearchHotkey(searchInputRef);
  const { state, reload, setData } = useAsync(listTrash, "trash");
  const [confirm, setConfirm] = useState<ConfirmState>({ kind: "none" });
  // Frozen copy of the last real confirm: dialog copy renders from it while
  // the close animation plays; the gen key remounts the picker per open.
  const [shownConfirm, setShownConfirm] = useState<ConfirmState>({
    kind: "none",
  });
  const [confirmGen, setConfirmGen] = useState(0);
  if (confirm.kind !== "none" && shownConfirm !== confirm)
    setShownConfirm(confirm);
  const openConfirm = (next: Exclude<ConfirmState, { kind: "none" }>) => {
    setConfirmGen((g) => g + 1);
    setConfirm(next);
  };
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const closeConfirm = () => setConfirm({ kind: "none" });
  // Bulk restore/purge loops run for seconds on big selections — one busy
  // flag disables their buttons so a double-click can't run them twice.
  const [bulkBusy, setBulkBusy] = useState(false);
  const runBulk = async (fn: () => Promise<void>) => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      await fn();
    } finally {
      setBulkBusy(false);
    }
  };

  const items = state.status === "success" ? state.data : [];
  const liveSelected = items.filter((i) => selectedIds.has(i.node.id));
  const selectionActive = liveSelected.length > 0;
  const allSelected = selectionActive && liveSelected.length === items.length;

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds(
      allSelected ? new Set() : new Set(items.map((i) => i.node.id)),
    );
  const clearSelection = () => setSelectedIds(new Set());

  // Expanded trashed containers — their contents load lazily so single
  // files can be pulled out of a deleted folder.
  const [expandedRoots, setExpandedRoots] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const toggleExpanded = (id: string) =>
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Search covers trash roots AND items inside deleted folders (RPC).
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const searching = debouncedQuery.length > 0;
  const search = useAsync(
    () => (searching ? searchTrash(debouncedQuery) : Promise.resolve([])),
    `trash-search:${debouncedQuery}`,
  );

  /** Returns exactly where the trash was opened from (home as fallback). */
  const goBack = () => {
    const dest = sessionStorage.getItem(TRASH_RETURN_KEY);
    router.push(dest && dest.startsWith("/") ? dest : "/");
  };

  const restore = useMutation((item: TrashItem) => restoreNode(item.node.id), {
    optimistic: (item) => {
      setData((list) => list.filter((i) => i.node.id !== item.node.id));
      return () => reload();
    },
    successToast: (restored) =>
      restored.type === "dataroom"
        ? "Dataroom restored"
        : restored.type === "folder"
          ? "Folder restored"
          : "File restored",
    errorToast: (e) =>
      e instanceof Error && e.message.includes("restore the dataroom")
        ? e.message
        : "Couldn't restore it",
  });

  const purge = useMutation((node: Node) => purgeNode(node.id), {
    optimistic: (node) => {
      setData((list) => list.filter((i) => i.node.id !== node.id));
      return () => reload();
    },
    successToast: "Deleted forever",
    errorToast: () => "Couldn't delete it",
  });

  const empty = useMutation(() => emptyTrash(), {
    successToast: (count) =>
      count === 1 ? "1 item deleted forever" : `${count} items deleted forever`,
    errorToast: () => "Couldn't empty the trash",
    onSuccess: () => reload(),
  });

  /** Bulk restore to original locations. */
  const restoreMany = async (nodes: Node[]) => {
    let done = 0;
    for (const node of nodes) {
      try {
        await restoreNode(node.id);
        done++;
      } catch {
        // continue; summarized below
      }
    }
    reload();
    clearSelection();
    if (done === nodes.length) {
      toast.success(done === 1 ? "Restored" : `${done} items restored`);
    } else {
      toast.error(`Restored ${done} of ${nodes.length} — some couldn't be`);
    }
  };

  /** Bulk restore into a picked folder/room (any dataroom). */
  const restoreManyTo = async (nodes: Node[], target: Node) => {
    let done = 0;
    for (const node of nodes) {
      try {
        await restoreNode(node.id, target.id);
        done++;
      } catch {
        // continue; summarized below
      }
    }
    reload();
    clearSelection();
    if (done > 0) {
      toast.success(
        done === 1
          ? `Restored to ${target.name}`
          : `${done} items restored to ${target.name}`,
      );
    } else {
      toast.error("Couldn't restore them");
    }
  };

  /** Bulk permanent delete (confirmed). */
  const purgeMany = async (nodes: Node[]) => {
    let done = 0;
    for (const node of nodes) {
      try {
        await purgeNode(node.id);
        done++;
      } catch {
        // continue; summarized below
      }
    }
    reload();
    clearSelection();
    toast.success(
      done === 1 ? "1 item deleted forever" : `${done} items deleted forever`,
    );
  };

  const openPurge = (node: Node, trigger: HTMLElement | null) => {
    setReturnTo(trigger);
    openConfirm({ kind: "purge", node, counts: null });
    void getDeleteCounts(node.id).then((counts) =>
      setConfirm((c) =>
        c.kind === "purge" && c.node.id === node.id ? { ...c, counts } : c,
      ),
    );
  };

  /**
   * "Empty trash?" must not undercount: roots are just the tip — sum
   * everything inside deleted folders too before naming a number.
   */
  const openEmptyConfirm = () => {
    openConfirm({ kind: "empty", counts: null });
    void Promise.all(
      items.map((i) =>
        getDeleteCounts(i.node.id).catch(() => ({ folders: 0, files: 0 })),
      ),
    ).then((all) =>
      setConfirm((c) =>
        c.kind === "empty"
          ? {
              ...c,
              counts: {
                folders: all.reduce((s, x) => s + x.folders, 0),
                files: all.reduce((s, x) => s + x.files, 0),
              },
            }
          : c,
      ),
    );
  };

  return (
    <>
      <AppHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back"
              className="text-muted-foreground"
              onClick={goBack}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Trash</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Restore items or delete them forever.
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                  placeholder="Search the trash"
                  aria-label="Search the trash"
                  className="w-56 pl-8 pr-8"
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-[color,background-color,scale] duration-150 outline-none hover:bg-muted hover:text-foreground active:scale-90 focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-150 motion-safe:ease-out-back"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={openEmptyConfirm}
              >
                <Trash2 /> Empty trash
              </Button>
            </div>
          )}
        </div>
        <section className="mt-6">
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
                  <p
                    role="status"
                    className="mb-2 text-xs text-muted-foreground"
                  >
                    {search.state.data.length === 1
                      ? "1 result"
                      : `${search.state.data.length} results`}{" "}
                    for &ldquo;{debouncedQuery}&rdquo;
                  </p>
                  <div className="divide-y overflow-hidden rounded-card border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
                    {search.state.data.map((hit) => (
                      <TrashSearchHit
                        key={hit.node.id}
                        hit={hit}
                        rootItem={items.find((i) => i.node.id === hit.rootId)}
                        onPurge={openPurge}
                        onRestored={() => {
                          reload();
                          search.reload();
                        }}
                      />
                    ))}
                  </div>
                  </>
                ))}
            </>
          ) : (
            <>
              {state.status === "loading" && <ListSkeleton variant="rows" />}
              {state.status === "error" && <ErrorState onRetry={reload} />}
              {state.status === "success" &&
                (items.length === 0 ? (
                  <EmptyState variant="trash-empty" />
                ) : (
              <div className="overflow-hidden rounded-card border bg-card">
                <div className="flex h-10 items-center gap-3 border-b px-4">
                  <Checkbox
                    checked={
                      allSelected
                        ? true
                        : selectionActive
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAll}
                    aria-label={
                      allSelected ? "Clear selection" : "Select all items"
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectionActive
                      ? `${liveSelected.length} selected`
                      : "Name"}
                  </span>
                </div>
                <div className="divide-y">
                  {items.map((item) => {
                    const { node } = item;
                    const isFolder = node.type !== "file";
                    const selected = selectedIds.has(node.id);
                    const expanded = expandedRoots.has(node.id);
                    return (
                      <div key={node.id}>
                      <div
                        className={cn(
                          "group/trash flex h-14 min-w-0 items-center gap-3 px-4 transition-colors hover:bg-muted/50 dark:hover:bg-foreground/5",
                          selected &&
                            "bg-selected hover:bg-selected dark:hover:bg-selected",
                        )}
                      >
                        {/* Same zoom+fade reveal wrapper as the room rows. */}
                        <span
                          className={cn(
                            "flex transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                            selected || selectionActive
                              ? "scale-100 opacity-100"
                              : "scale-90 opacity-0 group-hover/trash:scale-100 group-hover/trash:opacity-100 has-[:focus-visible]:scale-100 has-[:focus-visible]:opacity-100 pointer-coarse:scale-100 pointer-coarse:opacity-100",
                          )}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggle(node.id)}
                            aria-label={`Select ${node.name}`}
                          />
                        </span>
                        {isFolder ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? `Collapse ${node.name}`
                                : `Show contents of ${node.name}`
                            }
                            className="text-muted-foreground"
                            onClick={() => toggleExpanded(node.id)}
                          >
                            <ChevronRight
                              className={cn(
                                "transition-transform duration-200 ease-out-strong",
                                expanded && "rotate-90",
                              )}
                            />
                          </Button>
                        ) : (
                          <span className="w-6 shrink-0" aria-hidden />
                        )}
                        {node.type === "dataroom" ? (
                          <RoomAvatar
                            icon={node.icon}
                            color={node.color}
                            size="sm"
                          />
                        ) : (
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-tile ${
                              isFolder ? "bg-folder-bg" : "bg-file-bg"
                            }`}
                          >
                            {isFolder ? (
                              <Folder
                                className="size-5 text-folder"
                                strokeWidth={1.75}
                              />
                            ) : (
                              <FileText
                                className="size-5 text-file"
                                strokeWidth={1.75}
                              />
                            )}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-sm font-medium"
                            title={node.name}
                          >
                            {node.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.roomName ? `in ${item.roomName}` : "Dataroom"}
                            {" · Deleted "}
                            {formatDate(item.deletedAt)}
                          </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void restore.run(item).catch(() => {})}
                          >
                            <RotateCcw /> Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${node.name} forever`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={(e) => openPurge(node, e.currentTarget)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      {isFolder && expanded && (
                        <TrashBranch parentId={node.id} depth={1} />
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            </>
          )}
        </section>
      </main>

      {/* Bulk actions for the current selection — same motion language as
          the room's SelectionBar. */}
      {selectionActive && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 shadow-float dark:border-line-strong motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 motion-safe:ease-out-back">
            <span role="status" aria-live="polite" className="sr-only">
              {liveSelected.length} selected
            </span>
            <span
              key={liveSelected.length}
              aria-hidden
              className="text-sm font-medium tabular-nums motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
            >
              {liveSelected.length} selected
            </span>
            <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkBusy}
              onClick={() =>
                void runBulk(() => restoreMany(liveSelected.map((i) => i.node)))
              }
            >
              {bulkBusy ? <Loader2 className="animate-spin" /> : <RotateCcw />}{" "}
              <span className="max-sm:sr-only">Restore</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkBusy}
              onClick={() =>
                openConfirm({
                  kind: "restoreTo",
                  nodes: liveSelected.map((i) => i.node),
                })
              }
            >
              <FolderInput /> <span className="max-sm:sr-only">Restore to…</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkBusy}
              className="text-destructive hover:text-destructive"
              onClick={() =>
                openConfirm({
                  kind: "purgeMany",
                  nodes: liveSelected.map((i) => i.node),
                })
              }
            >
              <Trash2 /> <span className="max-sm:sr-only">Delete forever</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              className="text-muted-foreground"
              onClick={clearSelection}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <DeleteDialog
        open={confirm.kind === "purge"}
        target={shownConfirm.kind === "purge" ? shownConfirm.node : null}
        counts={shownConfirm.kind === "purge" ? shownConfirm.counts : null}
        onConfirm={async () => {
          if (confirm.kind === "purge") {
            await purge.run(confirm.node).catch(() => {});
            search.reload();
          }
        }}
        onClose={closeConfirm}
        returnFocusTo={returnTo}
      />

      <MoveDialog
        key={`restore-${confirmGen}`}
        open={confirm.kind === "restoreTo"}
        movingIds={
          new Set(
            shownConfirm.kind === "restoreTo"
              ? shownConfirm.nodes.map((n) => n.id)
              : [],
          )
        }
        movingLabel={
          shownConfirm.kind === "restoreTo"
            ? shownConfirm.nodes.length === 1
              ? shownConfirm.nodes[0].name
              : `${shownConfirm.nodes.length} items`
            : ""
        }
        onConfirm={async (target) => {
          if (confirm.kind !== "restoreTo") return;
          await restoreManyTo(confirm.nodes, target);
        }}
        onClose={closeConfirm}
      />

      <AlertDialog
        open={confirm.kind === "purgeMany"}
        onOpenChange={(next) => !next && closeConfirm()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{" "}
              {shownConfirm.kind === "purgeMany" ? shownConfirm.nodes.length : 0}{" "}
              items forever?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                if (confirm.kind === "purgeMany") {
                  const nodes = confirm.nodes;
                  void runBulk(() => purgeMany(nodes)).finally(closeConfirm);
                }
              }}
            >
              {bulkBusy && <Loader2 className="animate-spin" />}
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirm.kind === "empty"}
        onOpenChange={(next) => !next && closeConfirm()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const extra =
                  shownConfirm.kind === "empty" && shownConfirm.counts
                    ? shownConfirm.counts.folders + shownConfirm.counts.files
                    : null;
                const total = extra === null ? null : items.length + extra;
                if (total === null)
                  return `${items.length === 1 ? "1 item" : `${items.length} items`} will be deleted forever.`;
                return total === 1
                  ? "1 item will be deleted forever."
                  : `${total} items — including everything inside deleted folders — will be deleted forever.`;
              })()}{" "}
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={empty.pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={empty.pending}
              onClick={(e) => {
                e.preventDefault();
                void empty
                  .run()
                  .catch(() => {})
                  .finally(closeConfirm);
              }}
            >
              {empty.pending && <Loader2 className="animate-spin" />}
              Empty trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Lazy contents of a trashed container. Children aren't trash roots
 * themselves, so restoring one detaches it out of the deleted subtree
 * (back to where the deleted folder used to live) — the rest stays put.
 */
function TrashBranch({ parentId, depth }: { parentId: string; depth: number }) {
  const { state, setData } = useAsync(
    () => listChildren(parentId),
    `trash-branch:${parentId}`,
  );
  const indent = { paddingLeft: `${depth * 1.75 + 2.75}rem` };
  if (state.status === "loading") {
    return (
      <div className="flex h-11 items-center" style={indent}>
        <Skeleton className="h-3.5 w-44" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p
        className="flex h-11 items-center text-xs text-muted-foreground"
        style={indent}
      >
        Couldn&apos;t load this folder
      </p>
    );
  }
  if (state.data.length === 0) {
    return (
      <p
        className="flex h-11 items-center text-xs text-muted-foreground"
        style={indent}
      >
        Empty folder
      </p>
    );
  }
  return (
    <div className="pb-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      {state.data.map((child) => (
        <TrashChildRow
          key={child.id}
          node={child}
          depth={depth}
          onRestored={(id) =>
            setData((list) => list.filter((c) => c.id !== id))
          }
        />
      ))}
    </div>
  );
}

function TrashChildRow({
  node,
  depth,
  onRestored,
}: {
  node: Node;
  depth: number;
  onRestored: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isFolder = node.type !== "file";

  const restoreOut = async () => {
    setBusy(true);
    try {
      const restored = await restoreNode(node.id);
      toast.success("Restored", { description: restored.name });
      onRestored(node.id);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.includes("dataroom")
          ? err.message
          : "Couldn't restore it",
      );
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="group/branch flex h-11 min-w-0 items-center gap-2.5 pr-4"
        style={{ paddingLeft: `${depth * 1.75 + 1}rem` }}
      >
        {isFolder ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={open}
            aria-label={
              open ? `Collapse ${node.name}` : `Show contents of ${node.name}`
            }
            className="text-muted-foreground"
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronRight
              className={cn(
                "transition-transform duration-200 ease-out-strong",
                open && "rotate-90",
              )}
            />
          </Button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
            isFolder ? "bg-folder-bg" : "bg-file-bg"
          }`}
        >
          {isFolder ? (
            <Folder className="size-4 text-folder" strokeWidth={1.75} />
          ) : (
            <FileText className="size-4 text-file" strokeWidth={1.75} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm" title={node.name}>
          {node.name}
        </span>
        {node.type === "file" && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatBytes(node.size ?? 0)}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void restoreOut()}
        >
          <RotateCcw /> Restore
        </Button>
      </div>
      {isFolder && open && <TrashBranch parentId={node.id} depth={depth + 1} />}
    </>
  );
}

/** One search hit — a trash root or an item inside a deleted folder. */
function TrashSearchHit({
  hit,
  rootItem,
  onPurge,
  onRestored,
}: {
  hit: TrashSearchResult;
  /** The loaded root entry (room name, deletion date) when the hit IS a root. */
  rootItem?: TrashItem;
  onPurge: (node: Node, trigger: HTMLElement | null) => void;
  onRestored: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { node, isRoot, rootName } = hit;
  const isFolder = node.type !== "file";
  const context = isRoot
    ? `${rootItem?.roomName ? `in ${rootItem.roomName}` : "Dataroom"}${
        rootItem ? ` · Deleted ${formatDate(rootItem.deletedAt)}` : ""
      }`
    : `in ${rootName} · a deleted folder`;

  const restoreHit = async () => {
    setBusy(true);
    try {
      const restored = await restoreNode(node.id);
      toast.success("Restored", { description: restored.name });
      onRestored();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.includes("dataroom")
          ? err.message
          : "Couldn't restore it",
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex h-14 min-w-0 items-center gap-3 px-4">
      {node.type === "dataroom" ? (
        <RoomAvatar icon={node.icon} color={node.color} size="sm" />
      ) : (
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-tile ${
            isFolder ? "bg-folder-bg" : "bg-file-bg"
          }`}
        >
          {isFolder ? (
            <Folder className="size-5 text-folder" strokeWidth={1.75} />
          ) : (
            <FileText className="size-5 text-file" strokeWidth={1.75} />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={node.name}>
          {node.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {context}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void restoreHit()}
        >
          <RotateCcw /> Restore
        </Button>
        {isRoot && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${node.name} forever`}
            className="text-muted-foreground hover:text-destructive"
            onClick={(e) => onPurge(node, e.currentTarget)}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}
