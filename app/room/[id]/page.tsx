"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Search, Upload, X } from "lucide-react";
import type { DeleteCounts, Node } from "@/types";
import {
  compareNodes,
  createNode,
  deleteNodeRecursive,
  getDeleteCounts,
  getNode,
  isDuplicateNameError,
  listChildren,
  renameNode,
  saveFile,
  searchNodes,
} from "@/lib/storage";
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
import { DeleteDialog } from "@/components/delete-dialog";
import { UploadDropzone } from "@/components/upload-dropzone";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; node: Node }
  | { kind: "delete"; node: Node; counts: DeleteCounts | null };

/** The toolbar button is focused by its own click — capture it. */
const activeTrigger = () =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

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
    <RequireAuth>
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
  const { state, reload, setData } = useAsync(
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
    () => (searching ? searchNodes(roomId, debouncedQuery) : Promise.resolve([])),
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

  const deleteItem = useMutation(
    (node: Node) => deleteNodeRecursive(node.id),
    {
      optimistic: (node) => {
        setData((items) => items.filter((i) => i.id !== node.id));
        return () => reload(); // rollback: refetch the authoritative list
      },
      successToast: "Deleted",
      errorToast: () => "Couldn't delete",
    },
  );

  const openDelete = (node: Node, trigger: HTMLElement | null) => {
    setReturnTo(trigger);
    setDialog({ kind: "delete", node, counts: null });
    void getDeleteCounts(node.id).then((counts) =>
      setDialog((d) =>
        d.kind === "delete" && d.node.id === node.id ? { ...d, counts } : d,
      ),
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
              <Breadcrumbs crumbs={crumbs.crumbs ?? []} hrefFor={hrefFor} />
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
            <section className="mt-4">
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
                      <EmptyState variant="empty-folder" />
                    ) : (
                      <ItemsTable
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
                        onDelete={openDelete}
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
      <DeleteDialog
        open={dialog.kind === "delete"}
        target={dialog.kind === "delete" ? dialog.node : null}
        counts={dialog.kind === "delete" ? dialog.counts : null}
        onConfirm={async () => {
          if (dialog.kind === "delete") await deleteItem.run(dialog.node);
        }}
        onClose={closeDialog}
        returnFocusTo={returnTo}
      />
      <PdfViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
        returnFocusTo={returnTo}
      />
    </RoomShell>
  );
}
