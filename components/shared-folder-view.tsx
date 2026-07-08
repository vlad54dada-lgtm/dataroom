"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import type { Node } from "@/types";
import {
  getSharedAncestors,
  listSharedChildren,
  type SharedChild,
  type SharedNode,
} from "@/lib/storage";
import { formatBytes, formatModified } from "@/lib/utils";
import { useAsync } from "@/lib/hooks/use-async";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/list-skeleton";
import { ErrorState } from "@/components/error-state";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

interface SharedFolderViewProps {
  token: string;
  /** The shared folder the token resolves to (the browse root). */
  root: SharedNode;
}

/** A shared child rendered as the viewer's Node (read-only synthesis). */
function toViewerNode(child: SharedChild): Node {
  return {
    id: child.id,
    parentId: child.parentId,
    type: "file",
    name: child.name,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
    size: child.size ?? 0,
    blobKey: child.blobPath ?? undefined,
  };
}

/**
 * Anonymous read-only browser for a shared folder subtree. The current
 * folder lives in the URL (?folder=) like the app proper; folder rows are
 * real links, file rows open the product PDF viewer. Every read goes through
 * token-scoped RPCs — ids outside the shared subtree resolve to nothing and
 * render as "not available".
 */
export function SharedFolderView({ token, root }: SharedFolderViewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folder") ?? root.nodeId;
  const atRoot = folderId === root.nodeId;

  const { state, reload } = useAsync(
    () =>
      Promise.all([
        listSharedChildren(token, folderId),
        // Root needs no trail; deeper folders rebuild theirs on refresh.
        atRoot
          ? Promise.resolve([{ id: root.nodeId, name: root.name }])
          : getSharedAncestors(token, folderId),
      ]),
    `share:${token}:${folderId}`,
  );

  const [viewerFile, setViewerFile] = useState<Node | null>(null);
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);

  const files = useMemo(
    () =>
      state.status === "success"
        ? state.data[0].filter((c) => c.type === "file")
        : [],
    [state],
  );
  const viewerIndex = viewerFile
    ? files.findIndex((f) => f.id === viewerFile.id)
    : -1;

  const hrefFor = (id: string) =>
    id === root.nodeId ? pathname : `${pathname}?folder=${id}`;

  if (state.status === "loading") {
    return <ListSkeleton variant="rows" count={4} />;
  }
  if (state.status === "error") {
    return <ErrorState onRetry={reload} />;
  }

  const [children, trail] = state.data;
  // An id outside the shared subtree yields an empty trail — distinguish it
  // from a genuinely empty folder, which still resolves its ancestors.
  if (trail.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FolderOpen className="size-6" strokeWidth={1.75} />
        </span>
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-medium">
            This folder isn&apos;t available
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have been moved out of the shared folder or deleted.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={hrefFor(root.nodeId)}>Back to {root.name}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Trail within the shared subtree — the shared folder is "home". */}
      <nav aria-label="Breadcrumbs" className="flex min-w-0 items-center">
        <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                {i > 0 && (
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground/60"
                  />
                )}
                {last ? (
                  <span
                    aria-current="page"
                    className="max-w-56 truncate rounded-md px-1.5 py-1 font-medium"
                    title={crumb.name}
                  >
                    {crumb.name}
                  </span>
                ) : (
                  <Link
                    href={hrefFor(crumb.id)}
                    className="max-w-48 truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/70"
                    title={crumb.name}
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="mt-3 min-h-0">
        {children.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border bg-card px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Folder className="size-6" strokeWidth={1.75} />
            </span>
            <p className="font-heading text-lg font-medium">
              This folder is empty
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing has been added here yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border bg-card">
            {/* Ledger header, matching the app's table register. */}
            <div className="flex h-9 items-center gap-3 border-b bg-foreground/3 px-4 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
              <span className="flex-1">Name</span>
              <span className="hidden w-24 text-right md:block">Size</span>
              <span className="hidden w-40 md:block">Last modified</span>
            </div>
            <ul className="divide-y">
              {children.map((child) => {
                const isFolder = child.type === "folder";
                const meta = isFolder ? null : formatBytes(child.size ?? 0);
                const modified = formatModified(child.updatedAt);
                const rowInner = (
                  <>
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-tile ring-1 ring-inset ${
                        isFolder
                          ? "bg-folder-bg ring-folder/15"
                          : "bg-file-bg ring-file/15"
                      }`}
                    >
                      {isFolder ? (
                        <Folder
                          className="size-5 fill-folder/10 text-folder"
                          strokeWidth={1.75}
                        />
                      ) : (
                        <FileText
                          className="size-5 fill-file/10 text-file"
                          strokeWidth={1.75}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium"
                        title={child.name}
                      >
                        {child.name}
                        <span className="sr-only">
                          {isFolder ? ", folder" : ", PDF"}
                        </span>
                      </span>
                      <span className="block truncate text-xs tabular-nums text-muted-foreground md:hidden">
                        {meta ? `${meta} · ${modified}` : modified}
                      </span>
                    </span>
                    <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground md:block">
                      {meta ?? "—"}
                    </span>
                    <span className="hidden w-40 shrink-0 text-sm tabular-nums text-muted-foreground md:block">
                      {modified}
                    </span>
                  </>
                );
                const rowClass =
                  "flex h-12 w-full min-w-0 items-center gap-3 px-4 text-left transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-inset";
                return (
                  <li key={child.id}>
                    {isFolder ? (
                      <Link href={hrefFor(child.id)} className={rowClass}>
                        {rowInner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          setReturnTo(e.currentTarget);
                          setViewerFile(toViewerNode(child));
                        }}
                        className={rowClass}
                      >
                        {rowInner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <PdfViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
        returnFocusTo={returnTo}
        nav={
          viewerIndex >= 0 && files.length > 1
            ? {
                index: viewerIndex,
                total: files.length,
                onPrev: () => {
                  const prev = files[viewerIndex - 1];
                  if (prev) setViewerFile(toViewerNode(prev));
                },
                onNext: () => {
                  const next = files[viewerIndex + 1];
                  if (next) setViewerFile(toViewerNode(next));
                },
              }
            : undefined
        }
      />
    </div>
  );
}
