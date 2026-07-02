"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { DataroomPatch, Node } from "@/types";
import {
  compareNodes,
  countChildren,
  createNode,
  isDuplicateNameError,
  listChildren,
  restoreNode,
  trashNode,
  updateDataroom,
} from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { DataroomGrid } from "@/components/dataroom-grid";
import type { DataroomListItem } from "@/components/dataroom-card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import {
  DataroomDialog,
  type DataroomValues,
} from "@/components/dataroom-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; room: Node };

/** The toolbar/CTA button is focused by its own click — capture it. */
const activeTrigger = () =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

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
  return (
    <RequireAuth
      fallback={
        <>
          <AppHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
            <div className="mt-14">
              <ListSkeleton variant="cards" />
            </div>
          </main>
        </>
      }
    >
      <HomeView />
    </RequireAuth>
  );
}

function HomeView() {
  const { state, reload, setData } = useAsync(loadRooms, "datarooms");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  // Survives close: dialogs read it in onCloseAutoFocus AFTER state resets.
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const closeDialog = () => setDialog({ kind: "none" });

  const createRoom = useMutation(
    (values: DataroomValues) => createNode({ type: "dataroom", ...values }),
    {
      successToast: "Dataroom created",
      errorToast: (e) =>
        isDuplicateNameError(e) ? null : "Couldn't create the dataroom",
      onSuccess: (node) =>
        setData((items) => sortItems([...items, { node, itemCount: 0 }])),
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

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Datarooms</h1>
          {/* The empty state carries its own CTA — never two primary
              "Create dataroom" buttons on one screen. */}
          {!(state.status === "success" && state.data.length === 0) && (
            <Button
              onClick={() => {
                setReturnTo(activeTrigger());
                setDialog({ kind: "create" });
              }}
            >
              <Plus /> Create dataroom
            </Button>
          )}
        </div>
        <section className="mt-6">
          {state.status === "loading" && <ListSkeleton variant="cards" />}
          {state.status === "error" && <ErrorState onRetry={reload} />}
          {state.status === "success" &&
            (state.data.length === 0 ? (
              <EmptyState
                variant="no-datarooms"
                action={
                  <Button
                    onClick={() => {
                      setReturnTo(activeTrigger());
                      setDialog({ kind: "create" });
                    }}
                  >
                    <Plus /> Create dataroom
                  </Button>
                }
              />
            ) : (
              <DataroomGrid
                items={state.data}
                onEdit={(room, trigger) => {
                  setReturnTo(trigger);
                  setDialog({ kind: "edit", room });
                }}
                onDelete={(room) => void trashRoom.run(room).catch(() => {})}
              />
            ))}
        </section>
      </main>

      <DataroomDialog
        key={dialog.kind === "edit" ? `edit:${dialog.room.id}` : dialog.kind}
        open={dialog.kind === "create" || dialog.kind === "edit"}
        mode={dialog.kind === "edit" ? "edit" : "create"}
        initial={
          dialog.kind === "edit"
            ? {
                name: dialog.room.name,
                description: dialog.room.description ?? null,
                icon: dialog.room.icon ?? null,
                color: dialog.room.color ?? null,
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
