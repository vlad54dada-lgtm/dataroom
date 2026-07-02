"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { DeleteCounts, Node } from "@/types";
import {
  compareNodes,
  countChildren,
  createNode,
  deleteNodeRecursive,
  getDeleteCounts,
  isDuplicateNameError,
  listChildren,
  renameNode,
} from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { DataroomGrid } from "@/components/dataroom-grid";
import type { DataroomListItem } from "@/components/dataroom-card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { NameDialog } from "@/components/name-dialog";
import { DeleteDialog } from "@/components/delete-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; room: Node }
  | { kind: "delete"; room: Node; counts: DeleteCounts | null };

async function loadRooms(): Promise<DataroomListItem[]> {
  const rooms = await listChildren(null);
  return Promise.all(
    rooms.map(async (node) => ({
      node,
      itemCount: await countChildren(node.id),
    })),
  );
}

const sortItems = (items: DataroomListItem[]) =>
  [...items].sort((a, b) => compareNodes(a.node, b.node));

export default function HomePage() {
  const { state, reload, setData } = useAsync(loadRooms, "datarooms");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const closeDialog = () => setDialog({ kind: "none" });

  const createRoom = useMutation(
    (name: string) => createNode({ type: "dataroom", name }),
    {
      successToast: "Dataroom created",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't create the dataroom",
      onSuccess: (node) =>
        setData((items) => sortItems([...items, { node, itemCount: 0 }])),
    },
  );

  const renameRoom = useMutation(
    (room: Node, name: string) => renameNode(room.id, name),
    {
      successToast: "Dataroom renamed",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't rename the dataroom",
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

  const deleteRoom = useMutation(
    (room: Node) => deleteNodeRecursive(room.id),
    {
      optimistic: (room) => {
        setData((items) => items.filter((i) => i.node.id !== room.id));
        return () => reload(); // rollback: refetch the authoritative list
      },
      successToast: "Deleted",
      errorToast: () => "Couldn't delete the dataroom",
    },
  );

  const openDelete = (room: Node) => {
    setDialog({ kind: "delete", room, counts: null });
    void getDeleteCounts(room.id).then((counts) =>
      setDialog((d) =>
        d.kind === "delete" && d.room.id === room.id ? { ...d, counts } : d,
      ),
    );
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Datarooms</h1>
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus /> Create dataroom
          </Button>
        </div>
        <section className="mt-6">
          {state.status === "loading" && <ListSkeleton variant="cards" />}
          {state.status === "error" && <ErrorState onRetry={reload} />}
          {state.status === "success" &&
            (state.data.length === 0 ? (
              <EmptyState
                variant="no-datarooms"
                action={
                  <Button onClick={() => setDialog({ kind: "create" })}>
                    <Plus /> Create dataroom
                  </Button>
                }
              />
            ) : (
              <DataroomGrid
                items={state.data}
                onRename={(room) => setDialog({ kind: "rename", room })}
                onDelete={openDelete}
              />
            ))}
        </section>
      </main>

      <NameDialog
        key={dialog.kind === "rename" ? `rename:${dialog.room.id}` : dialog.kind}
        open={dialog.kind === "create" || dialog.kind === "rename"}
        mode={dialog.kind === "rename" ? "rename" : "create"}
        entity="dataroom"
        initialName={dialog.kind === "rename" ? dialog.room.name : ""}
        onSubmit={async (name) => {
          if (dialog.kind === "rename") await renameRoom.run(dialog.room, name);
          else await createRoom.run(name);
        }}
        onClose={closeDialog}
      />
      <DeleteDialog
        open={dialog.kind === "delete"}
        target={dialog.kind === "delete" ? dialog.room : null}
        counts={dialog.kind === "delete" ? dialog.counts : null}
        onConfirm={async () => {
          if (dialog.kind === "delete") await deleteRoom.run(dialog.room);
        }}
        onClose={closeDialog}
      />
    </>
  );
}
