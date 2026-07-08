"use client";

import { useParams, useRouter } from "next/navigation";
import { getMyNodeAccess, getNode } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";
import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { ListSkeleton } from "@/components/list-skeleton";
import { ErrorState } from "@/components/error-state";
import { NotFoundState } from "@/components/not-found-state";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

/**
 * Standalone viewer for a file shared with the caller by email — the target of
 * a per-file "Copy link". It is a REAL route, not a "?shared" home redirect:
 * a refresh simply re-resolves and re-shows the same file, so there is no
 * lingering query param to re-open on every navigation (the App Router does
 * not reliably clear a same-path query in production). Closing the viewer
 * returns home; access is still enforced by RLS.
 */
export default function SharedFilePage() {
  return (
    <RequireAuth>
      <SharedFileView />
    </RequireAuth>
  );
}

function SharedFileView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, reload } = useAsync(async () => {
    const [node, access] = await Promise.all([
      getNode(id),
      getMyNodeAccess(id),
    ]);
    return !node || access === null || node.type !== "file" ? null : node;
  }, `shared-file:${id}`);

  return (
    <>
      <AppHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 outline-none"
      >
        {state.status === "loading" && <ListSkeleton variant="rows" count={2} />}
        {state.status === "error" && <ErrorState onRetry={reload} />}
        {state.status === "success" && state.data === null && (
          <NotFoundState kind="file" />
        )}
      </main>
      <PdfViewerDialog
        file={state.status === "success" ? state.data : null}
        onClose={() => router.push("/")}
      />
    </>
  );
}
