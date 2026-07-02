"use client";

import { useState } from "react";
import { FileText, Folder, RotateCcw, Trash2 } from "lucide-react";
import type { DeleteCounts, Node } from "@/types";
import {
  emptyTrash,
  getDeleteCounts,
  listTrash,
  purgeNode,
  restoreNode,
  type TrashItem,
} from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { DeleteDialog } from "@/components/delete-dialog";

type ConfirmState =
  | { kind: "none" }
  | { kind: "purge"; node: Node; counts: DeleteCounts | null }
  | { kind: "empty" };

export default function TrashPage() {
  return (
    <RequireAuth>
      <TrashView />
    </RequireAuth>
  );
}

function TrashView() {
  const { state, reload, setData } = useAsync(listTrash, "trash");
  const [confirm, setConfirm] = useState<ConfirmState>({ kind: "none" });
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const closeConfirm = () => setConfirm({ kind: "none" });

  const restore = useMutation((item: TrashItem) => restoreNode(item.node.id), {
    optimistic: (item) => {
      setData((items) => items.filter((i) => i.node.id !== item.node.id));
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
      setData((items) => items.filter((i) => i.node.id !== node.id));
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

  const openPurge = (node: Node, trigger: HTMLElement | null) => {
    setReturnTo(trigger);
    setConfirm({ kind: "purge", node, counts: null });
    void getDeleteCounts(node.id).then((counts) =>
      setConfirm((c) =>
        c.kind === "purge" && c.node.id === node.id ? { ...c, counts } : c,
      ),
    );
  };

  const items = state.status === "success" ? state.data : [];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Trash</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Restore items or delete them forever.
            </p>
          </div>
          {items.length > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm({ kind: "empty" })}
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
              <div className="divide-y overflow-hidden rounded-card border bg-card">
                {items.map((item) => {
                  const { node } = item;
                  const isFolder = node.type !== "file";
                  return (
                    <div
                      key={node.id}
                      className="flex h-14 min-w-0 items-center gap-3 px-4"
                    >
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
                          onClick={() =>
                            void restore.run(item).catch(() => {})
                          }
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
            ))}
        </section>
      </main>

      <DeleteDialog
        open={confirm.kind === "purge"}
        target={confirm.kind === "purge" ? confirm.node : null}
        counts={confirm.kind === "purge" ? confirm.counts : null}
        onConfirm={async () => {
          if (confirm.kind === "purge")
            await purge.run(confirm.node).catch(() => {});
        }}
        onClose={closeConfirm}
        returnFocusTo={returnTo}
      />

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
