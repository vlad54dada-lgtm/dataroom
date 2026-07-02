"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Folder,
  FolderInput,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { DeleteCounts, Node } from "@/types";
import {
  emptyTrash,
  getDeleteCounts,
  listTrash,
  purgeNode,
  restoreNode,
  type TrashItem,
} from "@/lib/storage";
import { cn, formatDate } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  | { kind: "empty" };

export default function TrashPage() {
  return (
    <RequireAuth>
      <TrashView />
    </RequireAuth>
  );
}

function TrashView() {
  const router = useRouter();
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

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
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
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => openConfirm({ kind: "empty" })}
            >
              <Trash2 /> Empty trash
            </Button>
          )}
        </div>
        <section className="mt-6">
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
                    return (
                      <div
                        key={node.id}
                        className={cn(
                          "group/trash flex h-14 min-w-0 items-center gap-3 px-4",
                          selected && "bg-muted/50",
                        )}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggle(node.id)}
                          aria-label={`Select ${node.name}`}
                          className={cn(
                            "transition-opacity",
                            selected || selectionActive
                              ? "opacity-100"
                              : "opacity-0 group-hover/trash:opacity-100 focus-visible:opacity-100",
                          )}
                        />
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
                    );
                  })}
                </div>
              </div>
            ))}
        </section>
      </main>

      {/* Bulk actions for the current selection */}
      {selectionActive && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
          <div className="flex items-center gap-1 rounded-full border bg-card py-1.5 pr-1.5 pl-4 shadow-lg">
            <span className="text-sm font-medium tabular-nums">
              {liveSelected.length} selected
            </span>
            <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void restoreMany(liveSelected.map((i) => i.node))
              }
            >
              <RotateCcw /> Restore
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                openConfirm({
                  kind: "restoreTo",
                  nodes: liveSelected.map((i) => i.node),
                })
              }
            >
              <FolderInput /> Restore to…
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                openConfirm({
                  kind: "purgeMany",
                  nodes: liveSelected.map((i) => i.node),
                })
              }
            >
              <Trash2 /> Delete forever
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
          if (confirm.kind === "purge")
            await purge.run(confirm.node).catch(() => {});
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (confirm.kind === "purgeMany") {
                  void purgeMany(confirm.nodes).finally(closeConfirm);
                }
              }}
            >
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
              {items.length === 1
                ? "1 item will be deleted forever."
                : `${items.length} items will be deleted forever.`}{" "}
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void empty
                  .run()
                  .catch(() => {})
                  .finally(closeConfirm);
              }}
            >
              Empty trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
