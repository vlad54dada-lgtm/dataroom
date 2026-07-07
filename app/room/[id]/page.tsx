"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Search, Upload, X } from "lucide-react";
import type { Node } from "@/types";
import {
  compareNodes,
  createNode,
  getBlob,
  getNode,
  isDuplicateNameError,
  listChildCounts,
  listChildren,
  moveNodes,
  renameNode,
  restoreFileVersion,
  restoreNode,
  saveFile,
  searchNodes,
  trashNode,
  trashNodes,
  uploadNewVersion,
  type FileVersion,
} from "@/lib/storage";
import { RESTORE_MIME, readIds } from "@/lib/dnd";
import { flySourcesFor, flyToTrash } from "@/lib/fly-to-trash";
import { cn, normalizeName } from "@/lib/utils";
import { partitionPdfs } from "@/lib/validate";
import { extractPdfText } from "@/lib/extract-pdf-text";
import { prefetchAsync, useAsync } from "@/lib/hooks/use-async";
import { useMutation } from "@/lib/hooks/use-mutation";
import { useCurrentFolder } from "@/lib/hooks/use-current-folder";
import { useBreadcrumbs } from "@/lib/hooks/use-breadcrumbs";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useSearchHotkey } from "@/lib/hooks/use-search-hotkey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchResults } from "@/components/search-results";
import {
  DEFAULT_SEARCH_FILTER,
  SearchFilters,
  applySearchFilter,
  type SearchFilter,
} from "@/components/search-filters";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RoomToolbar } from "@/components/room-toolbar";
import {
  ItemsTable,
  sortItems,
  type ItemsSort,
} from "@/components/items-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { NotFoundState } from "@/components/not-found-state";
import { NameDialog } from "@/components/name-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { UploadConflictDialog } from "@/components/upload-conflict-dialog";
import { UploadDropzone } from "@/components/upload-dropzone";
import { UploadPanel, type UploadState } from "@/components/upload-panel";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { VersionHistoryDialog } from "@/components/version-history-dialog";
import { ShareDialog } from "@/components/share-dialog";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; node: Node }
  | { kind: "move"; nodes: Node[] }
  | { kind: "versions"; node: Node }
  | { kind: "share"; node: Node };

/** The toolbar button is focused by its own click — capture it. */
const activeTrigger = () =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

/**
 * Content-column skeleton — the shell (header + rail) lives in the /room
 * layout and persists across navigations; this fills only the column.
 */
function RoomFallback() {
  return (
    <>
      <div className="flex h-8 items-center">
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mt-4">
        <ListSkeleton variant="rows" count={4} />
      </div>
    </>
  );
}

/**
 * useSearchParams (inside useCurrentFolder) requires a Suspense boundary in
 * production builds — the fallback is column-shaped so a deep-folder
 * refresh never flashes a blank frame. Auth is guarded by the layout.
 */
export default function RoomPage() {
  return (
    <Suspense fallback={<RoomFallback />}>
      <RoomView />
    </Suspense>
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
  const currentCrumb = crumbs.crumbs?.[crumbs.crumbs.length - 1] ?? null;
  useDocumentTitle(
    currentCrumb ? `${currentCrumb.name} — Acme Corp. Dataroom` : null,
  );
  const { state, isStale, reload, setData } = useAsync(
    () => listChildren(currentFolderId),
    currentFolderId,
  );
  // Stale-while-revalidate is great WITHIN a room (folder hops feel
  // instant) but across rooms the held snapshot belongs to the previous
  // room — it must never flash under this room's breadcrumb. Track the
  // last room whose data actually settled (adjust-during-render, same
  // pattern as the frozen dialogs); foreign stale renders as loading.
  const [settledRoom, setSettledRoom] = useState<string | null>(null);
  if (state.status === "success" && !isStale && settledRoom !== roomId) {
    setSettledRoom(roomId);
  }
  const crossRoomStale = isStale && settledRoom !== roomId;
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  // Frozen copy of the last real dialog: content renders from it while the
  // close animation plays (`open` flips off `dialog` immediately). The gen
  // key remounts a dialog fresh per open — never mid-exit.
  const [shownDialog, setShownDialog] = useState<DialogState>({ kind: "none" });
  const [dialogGen, setDialogGen] = useState(0);
  if (dialog.kind !== "none" && shownDialog !== dialog) setShownDialog(dialog);
  const openDialog = (next: Exclude<DialogState, { kind: "none" }>) => {
    setDialogGen((g) => g + 1);
    setDialog(next);
  };
  const [viewerFile, setViewerFile] = useState<Node | null>(null);
  // Set only when opening from a content-search hit — arms the viewer's
  // find bar. Cleared on any other open (table click, gallery flip).
  const [viewerFind, setViewerFind] = useState<string | undefined>(undefined);
  const openViewer = (file: Node, find?: string) => {
    setViewerFind(find);
    setViewerFile(file);
  };
  // Survives close: dialogs read it in onCloseAutoFocus AFTER state resets.
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  // A trash-stack item is hovering over the content — show the drop zone.
  const [restoreOver, setRestoreOver] = useState(false);
  // Column sort lives here so it survives per-folder table remounts.
  const [sortState, setSortState] = useState<ItemsSort>(null);
  const closeDialog = () => setDialog({ kind: "none" });

  // Folder rows show what's inside them — one query per folder list.
  const [childCounts, setChildCounts] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  useEffect(() => {
    if (state.status !== "success") return;
    const folderIds = state.data
      .filter((n) => n.type !== "file")
      .map((n) => n.id);
    // Stale ids in the old map are harmless — unknown ids read undefined.
    if (folderIds.length === 0) return;
    let cancelled = false;
    listChildCounts(folderIds)
      .then((counts) => {
        if (!cancelled) setChildCounts(counts);
      })
      .catch(() => undefined); // cosmetic — folders fall back to "—"
    return () => {
      cancelled = true;
    };
  }, [state]);

  // The viewer flips through files in the same order the table shows them.
  const viewerFiles = useMemo(
    () =>
      sortItems(state.status === "success" ? state.data : [], sortState).filter(
        (n) => n.type === "file",
      ),
    [state, sortState],
  );
  const viewerIndex = viewerFile
    ? viewerFiles.findIndex((f) => f.id === viewerFile.id)
    : -1;

  // Search: debounced so each keystroke doesn't hit the database. The
  // query lives in the URL (?q=) so a refresh keeps the search — same
  // source-of-truth rule as the current folder.
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
    () =>
      searching ? searchNodes(roomId, debouncedQuery) : Promise.resolve([]),
    `search:${roomId}:${debouncedQuery}`,
  );
  // Result refinement chips; reset when the user leaves search (adjust-
  // during-render) so the next query never starts silently pre-filtered.
  const [searchFilter, setSearchFilter] = useState<SearchFilter>(
    DEFAULT_SEARCH_FILTER,
  );
  const [wasSearching, setWasSearching] = useState(searching);
  if (wasSearching !== searching) {
    setWasSearching(searching);
    if (!searching) setSearchFilter(DEFAULT_SEARCH_FILTER);
  }
  const searchHits = useMemo(
    () => (search.state.status === "success" ? search.state.data : []),
    [search.state],
  );
  const filteredHits = useMemo(
    () => applySearchFilter(searchHits, searchFilter),
    [searchHits, searchFilter],
  );

  // File versioning: "Upload new version" goes through a hidden picker so
  // the row menu action feels native; restore re-extracts text so content
  // search follows the current version.
  const versionInputRef = useRef<HTMLInputElement | null>(null);
  const versionTargetRef = useRef<Node | null>(null);
  const handleUploadVersion = (node: Node) => {
    versionTargetRef.current = node;
    versionInputRef.current?.click();
  };
  const handleVersionFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = e.currentTarget;
    const picked = input.files?.[0] ?? null;
    input.value = "";
    const target = versionTargetRef.current;
    versionTargetRef.current = null;
    if (!picked || !target) return;
    const { valid } = await partitionPdfs([picked]);
    if (valid.length === 0) {
      toast.error("Only PDF files can become a new version");
      return;
    }
    const toastId = toast.loading("Uploading new version…", {
      description: target.name,
    });
    try {
      const text = await extractPdfText(picked).catch(() => null);
      const updated = await uploadNewVersion(target, picked, text);
      setData((items) =>
        items.map((n) => (n.id === updated.id ? updated : n)),
      );
      toast.success("New version uploaded", {
        id: toastId,
        description: updated.name,
      });
    } catch {
      toast.error("Couldn't upload the new version", {
        id: toastId,
        description: target.name,
      });
    }
  };
  const handleRestoreVersion = async (
    fileNode: Node,
    version: FileVersion,
  ): Promise<Node> => {
    const blob = await getBlob(version.blobKey);
    const text = blob
      ? await extractPdfText(
          new File([blob], fileNode.name, { type: "application/pdf" }),
        ).catch(() => null)
      : null;
    const updated = await restoreFileVersion(fileNode, version, text);
    setData((items) => items.map((n) => (n.id === updated.id ? updated : n)));
    toast.success(`Version ${version.version} is now current`, {
      description: fileNode.name,
    });
    return updated;
  };

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
      flyToTrash(flySourcesFor([node.id])); // before the row leaves the DOM
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
   * surface as specific toasts. Undo moves everything back to where the
   * batch came from — the same promise every trash action makes.
   */
  const handleMove = async (ids: string[], target: Node) => {
    if (target.id === currentFolderId) return;
    const sourceId = currentFolderId; // every moved row came from this view
    try {
      const moved = await moveNodes(ids, target.id);
      if (moved > 0) {
        const idSet = new Set(ids);
        setData((items) => items.filter((i) => !idSet.has(i.id)));
        toast.success(
          moved === 1
            ? `Moved to ${target.name}`
            : `${moved} items moved to ${target.name}`,
          {
            action: {
              label: "Undo",
              onClick: () => {
                void moveNodes(ids, sourceId)
                  .then(() => reload())
                  .catch(() => toast.error("Couldn't undo the move"));
              },
            },
          },
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
    let done = 0;
    for (const id of ids) {
      try {
        await restoreNode(id, currentFolderId);
        done++;
      } catch {
        toast.error("Couldn't restore it");
        break;
      }
    }
    if (done > 0) {
      reload();
      toast.success(done === 1 ? "Restored" : `${done} items restored`);
    }
  };

  /** Bulk move-to-trash: one UPDATE, one undo toast for the whole batch. */
  const handleBulkTrash = async (nodes: Node[]) => {
    flyToTrash(flySourcesFor(nodes.map((n) => n.id)));
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

  // The floating trash button accepts row drops app-wide; this page owns
  // the rows, so it performs the actual move. No deps: re-subscribed each
  // render so the handler always sees the current list.
  useEffect(() => {
    const handle = (e: Event) => {
      const { ids } = (e as CustomEvent<{ ids: string[] }>).detail;
      const list = state.status === "success" ? state.data : [];
      const nodes = list.filter((n) => ids.includes(n.id));
      if (nodes.length > 0) void handleBulkTrash(nodes);
    };
    window.addEventListener("trash-drop-nodes", handle);
    return () => window.removeEventListener("trash-drop-nodes", handle);
  });

  /**
   * Sequential export of the selected files via temporary object URLs.
   * Failures never strand the loading toast: it always settles once, with
   * an honest count when some files couldn't be fetched.
   */
  const handleBulkDownload = async (files: Node[]) => {
    if (files.length === 0) return;
    const toastId = toast.loading(
      files.length === 1 ? "Downloading…" : `Downloading 1 of ${files.length}…`,
    );
    let done = 0;
    let failed = 0;
    for (const file of files) {
      try {
        if (!file.blobKey) {
          failed++;
          continue;
        }
        toast.loading(`Downloading ${done + 1} of ${files.length}…`, {
          id: toastId,
        });
        const blob = await getBlob(file.blobKey);
        if (!blob) {
          failed++;
          continue;
        }
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
      } catch {
        failed++;
      }
    }
    if (done === 0) {
      toast.error("Couldn't download the files", { id: toastId });
    } else if (failed > 0) {
      toast.error(`Downloaded ${done} of ${done + failed} files`, {
        id: toastId,
      });
    } else {
      toast.success(
        done === 1 ? "1 file downloaded" : `${done} files downloaded`,
        { id: toastId },
      );
    }
  };

  /**
   * Sequential upload: validation in code (ext + MIME + magic number), one
   * file at a time so suffixing stays deterministic and the UI never
   * freezes. Progress lives in a floating panel (per-file status, batch
   * progress bar, Cancel between files). The target is captured at drop
   * time; rows are only injected into the list the user is currently
   * looking at, and the batch stops if the destination folder is deleted
   * mid-flight.
   */
  const [upload, setUpload] = useState<UploadState | null>(null);
  const uploadCancelRef = useRef(false);
  // Drops during an in-flight batch APPEND to it instead of clobbering the
  // panel: one queue, one running loop, indices aligned with panel rows.
  // `versionOf` marks a conflict resolved as "upload as new version".
  const uploadQueueRef = useRef<
    { file: File; parentId: string; versionOf?: Node }[]
  >([]);
  const uploadRunningRef = useRef(false);
  const uploadIndexRef = useRef(0);
  const uploadActive = upload !== null && upload.outcome === null;

  useEffect(() => {
    if (!upload?.outcome) return;
    // Failed rows stay on screen until dismissed — evidence beats tidiness.
    if (upload.files.some((f) => f.status === "error")) return;
    const t = setTimeout(
      () => setUpload(null),
      upload.outcome === "done" ? 4000 : 8000,
    );
    return () => clearTimeout(t);
  }, [upload]);

  // Refresh/close during an upload would silently drop the queue — warn.
  useEffect(() => {
    if (!uploadActive) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadActive]);

  // Same-named PDFs already in this folder: the batch pauses BEFORE the
  // queue starts and asks once. In due diligence a name collision almost
  // always means a new revision of the same document, so "new version"
  // leads; "keep both" falls back to the (1) suffix policy.
  const [conflictPrompt, setConflictPrompt] = useState<{
    clean: File[];
    conflicts: { file: File; existing: Node }[];
    parentId: string;
  } | null>(null);

  const resolveConflicts = (mode: "version" | "keep-both") => {
    const prompt = conflictPrompt;
    if (!prompt) return;
    setConflictPrompt(null);
    void enqueueUploads([
      ...prompt.clean.map((file) => ({ file, parentId: prompt.parentId })),
      ...prompt.conflicts.map(({ file, existing }) => ({
        file,
        parentId: prompt.parentId,
        ...(mode === "version" ? { versionOf: existing } : {}),
      })),
    ]);
  };

  const handleFiles = async (incoming: File[]) => {
    if (incoming.length === 0) return;
    const parentId = currentFolderId;
    const { valid, invalid } = await partitionPdfs(incoming);
    if (invalid.length > 0) toast.error(summarizeInvalid(invalid));
    if (valid.length === 0) return;

    // Conflict scan against the folder the user is looking at (the listing
    // is already in memory — zero requests). A stale/loading listing just
    // skips the prompt and keeps the suffix behavior.
    const byName = new Map(
      (state.status === "success" ? state.data : [])
        .filter((n) => n.type === "file")
        .map((n) => [n.name.toLowerCase(), n] as const),
    );
    const conflicts: { file: File; existing: Node }[] = [];
    const clean: File[] = [];
    for (const file of valid) {
      const existing = byName.get(normalizeName(file.name).toLowerCase());
      if (existing) conflicts.push({ file, existing });
      else clean.push(file);
    }
    if (conflicts.length > 0) {
      setConflictPrompt({ clean, conflicts, parentId });
      return;
    }
    await enqueueUploads(valid.map((file) => ({ file, parentId })));
  };

  const enqueueUploads = async (
    jobs: { file: File; parentId: string; versionOf?: Node }[],
  ) => {
    if (jobs.length === 0) return;
    uploadQueueRef.current.push(...jobs);
    setUpload((u) => {
      const fresh = jobs.map((j) => ({
        name: j.file.name,
        status: "queued" as const,
      }));
      return u && u.outcome === null
        ? { ...u, files: [...u.files, ...fresh] }
        : { files: fresh, outcome: null };
    });
    if (uploadRunningRef.current) return; // the running loop drains the queue

    uploadRunningRef.current = true;
    uploadCancelRef.current = false;
    uploadIndexRef.current = 0;
    const setFileStatus = (
      index: number,
      status: UploadState["files"][number]["status"],
    ) =>
      setUpload(
        (u) =>
          u && {
            ...u,
            files: u.files.map((f, j) => (j === index ? { ...f, status } : f)),
          },
      );

    try {
      while (uploadQueueRef.current.length > 0) {
        if (uploadCancelRef.current) {
          uploadQueueRef.current = [];
          break;
        }
        const job = uploadQueueRef.current.shift();
        if (!job) break;
        const index = uploadIndexRef.current++;
        setFileStatus(index, "uploading");
        try {
          if (!(await getNode(job.parentId))) {
            // Destination vanished mid-flight — fail the file, keep going.
            setFileStatus(index, "error");
            continue;
          }
          // Extracted text powers content search; scanned PDFs return null.
          const contentText = await extractPdfText(job.file);
          // Conflict resolved as "new version": the file lands in the
          // existing document's history instead of becoming a sibling.
          const node = job.versionOf
            ? await uploadNewVersion(job.versionOf, job.file, contentText)
            : await saveFile(job.parentId, job.file, contentText);
          setFileStatus(index, "done");
          // The URL is the source of truth for where the user is NOW.
          const hereNow =
            new URLSearchParams(location.search).get("folder") ?? roomId;
          if (hereNow === job.parentId) {
            setData((items) =>
              job.versionOf
                ? sortNodes(
                    items.map((it) => (it.id === node.id ? node : it)),
                  )
                : items.some((it) => it.id === node.id)
                  ? items
                  : sortNodes([...items, node]),
            );
          }
        } catch {
          // One broken file must never sink the rest of the batch.
          setFileStatus(index, "error");
        }
      }
    } finally {
      uploadRunningRef.current = false;
    }
    setUpload(
      (u) =>
        u && { ...u, outcome: uploadCancelRef.current ? "cancelled" : "done" },
    );
  };

  // The shell (header + rail) lives in the /room layout and persists;
  // every state here fills only the content column.
  if (crumbs.error) return <ErrorState onRetry={crumbs.reload} />;
  if (crumbs.notFound)
    return <NotFoundState kind={isRoot ? "room" : "folder"} />;
  if (crumbs.loading || !crumbs.crumbs) return <RoomFallback />;

  return (
    <>
      {/* The visible location lives in the breadcrumbs; this names the
          page for screen readers and heading navigation. */}
      {currentCrumb && <h1 className="sr-only">{currentCrumb.name}</h1>}
      <UploadDropzone onFiles={handleFiles}>
        {({ open }) => (
          <div
            data-restore-zone
            className="relative flex flex-1 flex-col"
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(RESTORE_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setRestoreOver(true);
            }}
            onDragLeave={(e) => {
              const next = e.relatedTarget;
              if (!(next instanceof Element) || !e.currentTarget.contains(next))
                setRestoreOver(false);
            }}
            onDrop={(e) => {
              setRestoreOver(false);
              const ids = readIds(e.dataTransfer, RESTORE_MIME);
              if (ids.length === 0) return;
              e.preventDefault();
              void handleRestoreDrop(ids);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <Breadcrumbs
                crumbs={crumbs.crumbs ?? []}
                hrefFor={hrefFor}
                onDropNodes={(ids, target) => void handleMove(ids, target)}
                onPrefetch={(id) =>
                  prefetchAsync(id, () => listChildren(id))
                }
              />
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
                    placeholder="Search this dataroom"
                    aria-label="Search this dataroom"
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
                <RoomToolbar
                  onNewFolder={() => {
                    setReturnTo(activeTrigger());
                    openDialog({ kind: "create" });
                  }}
                >
                  <Button onClick={open}>
                    <Upload /> Upload
                  </Button>
                </RoomToolbar>
              </div>
            </div>
            {/* Keyed by folder: navigating fades the new location's content
                in with a slight rise — instant feedback on the click. */}
            <section
              key={currentFolderId}
              className={`mt-4 rounded-card transition-opacity duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 ${
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
                      <>
                        <div className="mb-2 flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <p
                            role="status"
                            className="text-xs text-muted-foreground"
                          >
                            {filteredHits.length === search.state.data.length
                              ? search.state.data.length === 1
                                ? "1 result"
                                : `${search.state.data.length} results`
                              : `${filteredHits.length} of ${search.state.data.length} results`}{" "}
                            for &ldquo;{debouncedQuery}&rdquo;
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
                              onClick={() =>
                                setSearchFilter(DEFAULT_SEARCH_FILTER)
                              }
                            >
                              Reset filters
                            </Button>
                          </div>
                        ) : (
                          <SearchResults
                            results={filteredHits}
                            query={debouncedQuery}
                            inset
                            onOpenFolder={(node) => {
                              setQuery("");
                              setDebouncedQuery("");
                              navigateToFolder(node.id);
                            }}
                            onOpenFile={(file, trigger) => {
                              setReturnTo(trigger);
                              // Content hit → open jumped to the match.
                              const hit = filteredHits.find(
                                (h) => h.node.id === file.id,
                              );
                              openViewer(
                                file,
                                hit?.contentMatch ? debouncedQuery : undefined,
                              );
                            }}
                            onOpenLocation={(parentId) => {
                              setQuery("");
                              setDebouncedQuery("");
                              navigateToFolder(parentId ?? roomId);
                            }}
                          />
                        )}
                      </>
                    ))}
                </>
              ) : (
                <>
                  {(state.status === "loading" || crossRoomStale) && (
                    <ListSkeleton variant="rows" count={4} />
                  )}
                  {state.status === "error" && <ErrorState onRetry={reload} />}
                  {state.status === "success" &&
                    !crossRoomStale &&
                    (state.data.length === 0 ? (
                      // The dashed frame IS the drop target: it lights up on
                      // hover and a click opens the file picker.
                      <button
                        type="button"
                        aria-label="Upload PDF files"
                        onClick={open}
                        className="group w-full cursor-pointer rounded-card border border-dashed border-line-strong transition-colors duration-200 outline-none hover:border-brand hover:bg-folder-bg/40 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/70"
                      >
                        <EmptyState variant="empty-folder" />
                      </button>
                    ) : (
                      <ItemsTable
                        key={currentFolderId} // navigation clears selection
                        items={state.data}
                        sort={sortState}
                        onSortChange={setSortState}
                        onDownloadNode={(node) =>
                          void handleBulkDownload([node])
                        }
                        onMoveNode={(node) =>
                          openDialog({ kind: "move", nodes: [node] })
                        }
                        onUploadVersion={handleUploadVersion}
                        onVersionHistory={(node, trigger) => {
                          setReturnTo(trigger);
                          openDialog({ kind: "versions", node });
                        }}
                        onShare={(node, trigger) => {
                          setReturnTo(trigger);
                          openDialog({ kind: "share", node });
                        }}
                        onPrefetch={(id) =>
                          prefetchAsync(id, () => listChildren(id))
                        }
                        childCounts={childCounts}
                        hrefFor={hrefFor}
                        onOpenFile={(file, trigger) => {
                          setReturnTo(trigger);
                          openViewer(file);
                        }}
                        onRename={(node, trigger) => {
                          setReturnTo(trigger);
                          openDialog({ kind: "rename", node });
                        }}
                        onDelete={(node) =>
                          void trashItem.run(node).catch(() => {})
                        }
                        onBulkTrash={(nodes) => void handleBulkTrash(nodes)}
                        onBulkDownload={(files) =>
                          void handleBulkDownload(files)
                        }
                        onBulkMove={(nodes) =>
                          openDialog({ kind: "move", nodes })
                        }
                        onDropNodes={(ids, target) =>
                          void handleMove(ids, target)
                        }
                      />
                    ))}
                </>
              )}
            </section>
            {/* Full-area restore target: dragging out of the trash stack
                lights up the whole content region, not just the table. */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute -inset-2 z-20 flex items-center justify-center rounded-card border-2 border-dashed border-brand bg-folder-bg/70 opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
                restoreOver && "opacity-100",
              )}
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-2 text-brand transition-transform duration-200 ease-out-strong motion-reduce:transition-none dark:text-brand-hover",
                  restoreOver ? "scale-100" : "scale-95",
                )}
              >
                <RotateCcw className="size-8" strokeWidth={1.75} />
                <p className="text-sm font-medium">Drop to restore here</p>
              </div>
            </div>
          </div>
        )}
      </UploadDropzone>

      <NameDialog
        key={`name-${dialogGen}`}
        open={dialog.kind === "create" || dialog.kind === "rename"}
        mode={shownDialog.kind === "rename" ? "rename" : "create"}
        entity={
          shownDialog.kind === "rename" && shownDialog.node.type === "file"
            ? "file"
            : "folder"
        }
        initialName={shownDialog.kind === "rename" ? shownDialog.node.name : ""}
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
        initialFind={viewerFind}
        nav={
          viewerIndex >= 0 && viewerFiles.length > 1
            ? {
                index: viewerIndex,
                total: viewerFiles.length,
                onPrev: () => {
                  const prev = viewerFiles[viewerIndex - 1];
                  if (prev) openViewer(prev);
                },
                onNext: () => {
                  const next = viewerFiles[viewerIndex + 1];
                  if (next) openViewer(next);
                },
              }
            : undefined
        }
      />
      {upload && (
        <UploadPanel
          state={upload}
          onCancel={() => {
            uploadCancelRef.current = true;
          }}
          onDismiss={() => setUpload(null)}
        />
      )}
      <UploadConflictDialog
        open={conflictPrompt !== null}
        count={conflictPrompt?.conflicts.length ?? 0}
        firstName={conflictPrompt?.conflicts[0]?.file.name ?? ""}
        onNewVersion={() => resolveConflicts("version")}
        onKeepBoth={() => resolveConflicts("keep-both")}
        onCancel={() => setConflictPrompt(null)}
      />
      {/* Hidden picker behind "Upload new version" — one PDF, same name/id. */}
      <input
        ref={versionInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void handleVersionFile(e)}
      />
      <VersionHistoryDialog
        key={`versions-${dialogGen}`}
        file={dialog.kind === "versions" ? dialog.node : null}
        onClose={closeDialog}
        returnFocusTo={returnTo}
        onRestore={handleRestoreVersion}
      />
      <ShareDialog
        key={`share-${dialogGen}`}
        file={dialog.kind === "share" ? dialog.node : null}
        onClose={closeDialog}
        returnFocusTo={returnTo}
      />
      <MoveDialog
        key={`move-${dialogGen}`}
        currentLocationId={currentFolderId}
        open={dialog.kind === "move"}
        movingIds={
          new Set(
            shownDialog.kind === "move"
              ? shownDialog.nodes.map((n) => n.id)
              : [],
          )
        }
        movingLabel={
          shownDialog.kind === "move"
            ? shownDialog.nodes.length === 1
              ? shownDialog.nodes[0].name
              : `${shownDialog.nodes.length} items`
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
    </>
  );
}
