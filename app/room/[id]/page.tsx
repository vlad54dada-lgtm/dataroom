"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Search, Upload, X } from "lucide-react";
import type { Node } from "@/types";
import {
  compareNodes,
  createNode,
  getBlob,
  getNode,
  isDuplicateNameError,
  listChildren,
  moveNodes,
  renameNode,
  restoreNode,
  saveFile,
  searchNodes,
  trashNode,
  trashNodes,
} from "@/lib/storage";
import { RESTORE_MIME, readIds } from "@/lib/dnd";
import { partitionPdfs } from "@/lib/validate";
import { extractPdfText } from "@/lib/extract-pdf-text";
import { useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { useCurrentFolder } from "@/lib/hooks/use-current-folder";
import { useBreadcrumbs } from "@/lib/hooks/use-breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { SearchResults } from "@/components/search-results";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RoomToolbar } from "@/components/room-toolbar";
import { ItemsTable } from "@/components/items-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { NotFoundState } from "@/components/not-found-state";
import { NameDialog } from "@/components/name-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { UploadDropzone } from "@/components/upload-dropzone";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; node: Node }
  | { kind: "move"; nodes: Node[] };

/** The toolbar button is focused by its own click — capture it. */
const activeTrigger = () =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {children}
      </main>
    </>
  );
}

/** Room-shaped skeleton — used as the Suspense fallback AND on first load. */
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
    <RequireAuth fallback={<RoomFallback />}>
      <Suspense fallback={<RoomFallback />}>
        <RoomView />
      </Suspense>
    </RequireAuth>
  );
}

const sortNodes = (nodes: Node[]) => [...nodes].sort(compareNodes);

const summarizeInvalid = (files: File[]): string => {
  if (files.length === 1) return `${files[0].name} isn't a PDF and was skipped`;
  const names = files.map((f) => f.name);
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `${files.length} files aren't PDFs and were skipped: ${shown}${more}`;
};

function RoomView() {
  const { id: roomId } = useParams<{ id: string }>();
  const { currentFolderId, isRoot, hrefFor, navigateToFolder } =
    useCurrentFolder(roomId);
  const crumbs = useBreadcrumbs(roomId, currentFolderId);
  const { state, isStale, reload, setData } = useAsync(
    () => listChildren(currentFolderId),
    currentFolderId,
  );
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [viewerFile, setViewerFile] = useState<Node | null>(null);
  // Survives close: dialogs read it in onCloseAutoFocus AFTER state resets.
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const closeDialog = () => setDialog({ kind: "none" });

  // Search: debounced so each keystroke doesn't hit the database.
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const searching = debouncedQuery.length > 0;
  const search = useAsync(
    () =>
      searching ? searchNodes(roomId, debouncedQuery) : Promise.resolve([]),
    `search:${roomId}:${debouncedQuery}`,
  );

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

  const renameItem = useMutation(
    (node: Node, name: string) => renameNode(node.id, name),
    {
      successToast: (updated) =>
        updated.type === "file" ? "File renamed" : "Folder renamed",
      errorToast: (e) => (isDuplicateNameError(e) ? null : "Couldn't rename"),
      onSuccess: (updated) =>
        setData((items) =>
          sortNodes(items.map((i) => (i.id === updated.id ? updated : i))),
        ),
    },
  );

  /**
   * Moving to trash is reversible, so there's no confirm dialog: the row
   * disappears immediately and the toast carries Undo.
   */
  const trashItem = useMutation((node: Node) => trashNode(node.id), {
    optimistic: (node) => {
      setData((items) => items.filter((i) => i.id !== node.id));
      return () => reload(); // rollback: refetch the authoritative list
    },
    errorToast: () => "Couldn't move it to trash",
    onSuccess: (_result, node) => {
      // Deferred one tick: firing in the same commit as the closing kebab
      // menu's portal teardown gets the toast node swept away with it.
      setTimeout(() => {
        toast.success("Moved to trash", {
          description: node.name,
          action: {
            label: "Undo",
            onClick: () => {
              void restoreNode(node.id)
                .then(() => reload())
                .catch(() => toast.error("Couldn't restore it"));
            },
          },
        });
      }, 50);
    },
  });

  /**
   * Moving nodes (drag-and-drop or the Move to… dialog). Rows leave the
   * current view when they move elsewhere; errors (cycles, gone targets)
   * surface as specific toasts.
   */
  const handleMove = async (ids: string[], target: Node) => {
    if (target.id === currentFolderId) return;
    try {
      const moved = await moveNodes(ids, target.id);
      if (moved > 0) {
        const idSet = new Set(ids);
        setData((items) => items.filter((i) => !idSet.has(i.id)));
        toast.success(
          moved === 1
            ? `Moved to ${target.name}`
            : `${moved} items moved to ${target.name}`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.startsWith("Can't")
          ? err.message
          : "Couldn't move that",
      );
    }
  };

  /** Dragging an item out of the trash stack restores it right here. */
  const handleRestoreDrop = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await restoreNode(id, currentFolderId);
      } catch {
        toast.error("Couldn't restore it");
        return;
      }
    }
    reload();
    toast.success(ids.length === 1 ? "Restored" : `${ids.length} restored`);
  };

  /** Bulk move-to-trash: one UPDATE, one undo toast for the whole batch. */
  const handleBulkTrash = async (nodes: Node[]) => {
    const ids = new Set(nodes.map((n) => n.id));
    setData((items) => items.filter((i) => !ids.has(i.id)));
    try {
      await trashNodes([...ids]);
    } catch {
      reload();
      toast.error("Couldn't move them to trash");
      return;
    }
    setTimeout(() => {
      toast.success(
        nodes.length === 1
          ? "Moved to trash"
          : `${nodes.length} items moved to trash`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              void (async () => {
                for (const n of nodes) {
                  await restoreNode(n.id).catch(() => undefined);
                }
                reload();
              })();
            },
          },
        },
      );
    }, 50);
  };

  /** Sequential export of the selected files via temporary object URLs. */
  const handleBulkDownload = async (files: Node[]) => {
    if (files.length === 0) return;
    const toastId = toast.loading(
      files.length === 1 ? "Downloading…" : `Downloading 1 of ${files.length}…`,
    );
    let done = 0;
    for (const file of files) {
      if (!file.blobKey) continue;
      toast.loading(`Downloading ${done + 1} of ${files.length}…`, {
        id: toastId,
      });
      const blob = await getBlob(file.blobKey);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      done++;
      // Small gap keeps browsers from swallowing rapid download triggers.
      await new Promise((r) => setTimeout(r, 350));
    }
    toast.success(
      done === 1 ? "1 file downloaded" : `${done} files downloaded`,
      { id: toastId },
    );
  };

  /**
   * Sequential upload: validation in code (ext + MIME + magic number), one
   * file at a time so suffixing stays deterministic and the UI never
   * freezes. The target is captured at drop time; rows are only injected
   * into the list the user is currently looking at, and the batch stops if
   * the destination folder is deleted mid-flight.
   */
  const handleFiles = async (incoming: File[]) => {
    if (incoming.length === 0) return;
    const parentId = currentFolderId;
    const { valid, invalid } = await partitionPdfs(incoming);
    if (invalid.length > 0) toast.error(summarizeInvalid(invalid));
    if (valid.length === 0) return;
    const toastId = toast.loading(`Uploading 1 of ${valid.length}…`);
    let done = 0;
    for (const file of valid) {
      if (!(await getNode(parentId))) {
        toast.error("Upload stopped — the destination folder was deleted", {
          id: toastId,
        });
        return;
      }
      toast.loading(`Uploading ${done + 1} of ${valid.length}…`, {
        id: toastId,
      });
      // Extracted text powers content search; scanned PDFs return null.
      const contentText = await extractPdfText(file);
      const node = await saveFile(parentId, file, contentText);
      done++;
      // The URL is the source of truth for where the user is NOW.
      const hereNow =
        new URLSearchParams(location.search).get("folder") ?? roomId;
      if (hereNow === parentId) {
        setData((items) =>
          items.some((i) => i.id === node.id)
            ? items
            : sortNodes([...items, node]),
        );
      }
    }
    toast.success(done === 1 ? "1 file uploaded" : `${done} files uploaded`, {
      id: toastId,
    });
  };

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
      <UploadDropzone onFiles={handleFiles}>
        {({ open }) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <Breadcrumbs
                crumbs={crumbs.crumbs ?? []}
                hrefFor={hrefFor}
                onDropNodes={(ids, target) => void handleMove(ids, target)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search this dataroom"
                    aria-label="Search this dataroom"
                    className="w-56 pl-8 pr-8"
                  />
                  {query.length > 0 && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                      className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <RoomToolbar
                  onNewFolder={() => {
                    setReturnTo(activeTrigger());
                    setDialog({ kind: "create" });
                  }}
                >
                  <Button onClick={open}>
                    <Upload /> Upload
                  </Button>
                </RoomToolbar>
              </div>
            </div>
            <section
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(RESTORE_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(e) => {
                const ids = readIds(e.dataTransfer, RESTORE_MIME);
                if (ids.length === 0) return;
                e.preventDefault();
                void handleRestoreDrop(ids);
              }}
              className={`mt-4 transition-opacity duration-200 ${
                isStale || (searching && search.isStale)
                  ? "opacity-60"
                  : "opacity-100"
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
                      <SearchResults
                        results={search.state.data}
                        onOpenFolder={(node) => {
                          setQuery("");
                          setDebouncedQuery("");
                          navigateToFolder(node.id);
                        }}
                        onOpenFile={(file, trigger) => {
                          setReturnTo(trigger);
                          setViewerFile(file);
                        }}
                      />
                    ))}
                </>
              ) : (
                <>
                  {state.status === "loading" && (
                    <ListSkeleton variant="rows" count={4} />
                  )}
                  {state.status === "error" && <ErrorState onRetry={reload} />}
                  {state.status === "success" &&
                    (state.data.length === 0 ? (
                      // The dashed frame IS the drop target: it lights up on
                      // hover and a click opens the file picker.
                      <button
                        type="button"
                        aria-label="Upload PDF files"
                        onClick={open}
                        className="group w-full cursor-pointer rounded-card border border-dashed border-line-strong transition-colors duration-200 outline-none hover:border-brand hover:bg-folder-bg/40 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <EmptyState variant="empty-folder" />
                      </button>
                    ) : (
                      <ItemsTable
                        key={currentFolderId} // navigation clears selection
                        items={state.data}
                        hrefFor={hrefFor}
                        onOpenFile={(file, trigger) => {
                          setReturnTo(trigger);
                          setViewerFile(file);
                        }}
                        onRename={(node, trigger) => {
                          setReturnTo(trigger);
                          setDialog({ kind: "rename", node });
                        }}
                        onDelete={(node) =>
                          void trashItem.run(node).catch(() => {})
                        }
                        onBulkTrash={(nodes) => void handleBulkTrash(nodes)}
                        onBulkDownload={(files) =>
                          void handleBulkDownload(files)
                        }
                        onBulkMove={(nodes) =>
                          setDialog({ kind: "move", nodes })
                        }
                        onDropNodes={(ids, target) =>
                          void handleMove(ids, target)
                        }
                      />
                    ))}
                </>
              )}
            </section>
          </>
        )}
      </UploadDropzone>

      <NameDialog
        key={
          dialog.kind === "rename"
            ? `rename:${dialog.node.id}`
            : `${dialog.kind}:${currentFolderId}`
        }
        open={dialog.kind === "create" || dialog.kind === "rename"}
        mode={dialog.kind === "rename" ? "rename" : "create"}
        entity={
          dialog.kind === "rename" && dialog.node.type === "file"
            ? "file"
            : "folder"
        }
        initialName={dialog.kind === "rename" ? dialog.node.name : ""}
        onSubmit={async (name) => {
          if (dialog.kind === "rename") await renameItem.run(dialog.node, name);
          else await createFolder.run(name);
        }}
        onClose={closeDialog}
        returnFocusTo={returnTo}
      />
      <PdfViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
        returnFocusTo={returnTo}
      />
      <MoveDialog
        key={dialog.kind === "move" ? "move-open" : "move-closed"}
        open={dialog.kind === "move"}
        movingIds={
          new Set(dialog.kind === "move" ? dialog.nodes.map((n) => n.id) : [])
        }
        movingLabel={
          dialog.kind === "move"
            ? dialog.nodes.length === 1
              ? dialog.nodes[0].name
              : `${dialog.nodes.length} items`
            : ""
        }
        onConfirm={async (target) => {
          if (dialog.kind !== "move") return;
          await handleMove(
            dialog.nodes.map((n) => n.id),
            target,
          );
        }}
        onClose={closeDialog}
      />
    </RoomShell>
  );
}
