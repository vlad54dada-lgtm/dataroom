"use client";

import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import type { DeleteCounts, Node } from "@/types";
import {
  compareNodes,
  createNode,
  deleteNodeRecursive,
  getDeleteCounts,
  isDuplicateNameError,
  listChildren,
  renameNode,
} from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { useCurrentFolder } from "@/lib/hooks/use-current-folder";
import { useBreadcrumbs } from "@/lib/hooks/use-breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RoomToolbar } from "@/components/room-toolbar";
import { ItemsTable } from "@/components/items-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { NotFoundState } from "@/components/not-found-state";
import { NameDialog } from "@/components/name-dialog";
import { DeleteDialog } from "@/components/delete-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; node: Node }
  | { kind: "delete"; node: Node; counts: DeleteCounts | null };

function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6">
        {children}
      </main>
    </>
  );
}

/** Room-shaped skeleton — used as the Suspense fallback AND while resolving. */
function RoomFallback() {
  return (
    <RoomShell>
      <div className="flex h-8 items-center">
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mt-4">
        <ListSkeleton variant="rows" count={4} />
      </div>
    </RoomShell>
  );
}

/**
 * useSearchParams (inside useCurrentFolder) requires a Suspense boundary in
 * production builds — the fallback is room-shaped so a deep-folder refresh
 * never flashes a blank frame.
 */
export default function RoomPage() {
  return (
    <Suspense fallback={<RoomFallback />}>
      <RoomView />
    </Suspense>
  );
}

const sortNodes = (nodes: Node[]) => [...nodes].sort(compareNodes);

function RoomView() {
  const { id: roomId } = useParams<{ id: string }>();
  const { currentFolderId, isRoot, hrefFor } = useCurrentFolder(roomId);
  const crumbs = useBreadcrumbs(roomId, currentFolderId);
  const { state, reload, setData } = useAsync(
    () => listChildren(currentFolderId),
    currentFolderId,
  );
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const closeDialog = () => setDialog({ kind: "none" });

  const createFolder = useMutation(
    (name: string) =>
      createNode({ type: "folder", parentId: currentFolderId, name }),
    {
      successToast: "Folder created",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't create the folder",
      onSuccess: (node) => setData((items) => sortNodes([...items, node])),
    },
  );

  const renameFolder = useMutation(
    (node: Node, name: string) => renameNode(node.id, name),
    {
      successToast: "Folder renamed",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't rename the folder",
      onSuccess: (updated) =>
        setData((items) =>
          sortNodes(items.map((i) => (i.id === updated.id ? updated : i))),
        ),
    },
  );

  const deleteItem = useMutation(
    (node: Node) => deleteNodeRecursive(node.id),
    {
      optimistic: (node) => {
        setData((items) => items.filter((i) => i.id !== node.id));
        return () => reload(); // rollback: refetch the authoritative list
      },
      successToast: "Deleted",
      errorToast: () => "Couldn't delete the folder",
    },
  );

  const openDelete = (node: Node) => {
    setDialog({ kind: "delete", node, counts: null });
    void getDeleteCounts(node.id).then((counts) =>
      setDialog((d) =>
        d.kind === "delete" && d.node.id === node.id ? { ...d, counts } : d,
      ),
    );
  };

  // Files are only creatable once upload ships (next block, together with
  // the viewer) — no file row can render yet, so this never fires.
  const openFile = () => undefined;

  if (crumbs.error) {
    return (
      <RoomShell>
        <ErrorState onRetry={crumbs.reload} />
      </RoomShell>
    );
  }
  if (crumbs.notFound) {
    return (
      <RoomShell>
        <NotFoundState kind={isRoot ? "room" : "folder"} />
      </RoomShell>
    );
  }
  if (crumbs.loading || !crumbs.crumbs) return <RoomFallback />;

  return (
    <RoomShell>
      <div className="flex items-center justify-between gap-4">
        <Breadcrumbs crumbs={crumbs.crumbs} hrefFor={hrefFor} />
        <RoomToolbar onNewFolder={() => setDialog({ kind: "create" })} />
      </div>
      <section className="mt-4">
        {state.status === "loading" && <ListSkeleton variant="rows" count={4} />}
        {state.status === "error" && <ErrorState onRetry={reload} />}
        {state.status === "success" &&
          (state.data.length === 0 ? (
            <EmptyState variant="empty-folder" />
          ) : (
            <ItemsTable
              items={state.data}
              hrefFor={hrefFor}
              onOpenFile={openFile}
              onRename={(node) => setDialog({ kind: "rename", node })}
              onDelete={openDelete}
            />
          ))}
      </section>

      <NameDialog
        key={
          dialog.kind === "rename"
            ? `rename:${dialog.node.id}`
            : `${dialog.kind}:${currentFolderId}`
        }
        open={dialog.kind === "create" || dialog.kind === "rename"}
        mode={dialog.kind === "rename" ? "rename" : "create"}
        entity="folder"
        initialName={dialog.kind === "rename" ? dialog.node.name : ""}
        onSubmit={async (name) => {
          if (dialog.kind === "rename")
            await renameFolder.run(dialog.node, name);
          else await createFolder.run(name);
        }}
        onClose={closeDialog}
      />
      <DeleteDialog
        open={dialog.kind === "delete"}
        target={dialog.kind === "delete" ? dialog.node : null}
        counts={dialog.kind === "delete" ? dialog.counts : null}
        onConfirm={async () => {
          if (dialog.kind === "delete") await deleteItem.run(dialog.node);
        }}
        onClose={closeDialog}
      />
    </RoomShell>
  );
}
