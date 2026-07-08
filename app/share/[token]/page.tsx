"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Download, FileText, Folder, Loader2 } from "lucide-react";
import {
  getBlob,
  getSharedNode,
  recordShareOpen,
  type SharedNode,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PdfCanvasViewer } from "@/components/pdf-canvas-viewer";
import { SharedFolderView } from "@/components/shared-folder-view";
import { ListSkeleton } from "@/components/list-skeleton";

// Settled result for one token; "loading" is derived — no settled state for
// the current token yet — so the effect never sets state synchronously.
type SettledState =
  | { token: string; status: "gone" }
  | { token: string; status: "file"; node: SharedNode; url: string }
  | { token: string; status: "folder"; node: SharedNode };

type LoadState =
  | { status: "loading" }
  | { status: "gone" }
  | { status: "file"; node: SharedNode; url: string }
  | { status: "folder"; node: SharedNode };

/**
 * Public, sign-in-free view of a shared node. The token in the URL is the
 * capability: a FILE renders in the product PDF viewer; a FOLDER opens a
 * read-only browser of the shared subtree. Resolution and blob reads run
 * under SECURITY DEFINER RPCs + the anon storage policy; each visit bumps
 * the link's open counter.
 */
export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [settled, setSettled] = useState<SettledState | null>(null);
  // pdf.js couldn't parse THIS token's document — browser-renderer fallback.
  const [failedToken, setFailedToken] = useState<string | null>(null);
  const canvasFailed = failedToken === token;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const node = await getSharedNode(token);
        if (!node) {
          if (!cancelled) setSettled({ token, status: "gone" });
          return;
        }
        // A resolved link is an open — folders too, once per session.
        void recordShareOpen(token);
        if (node.type === "folder") {
          if (!cancelled) setSettled({ token, status: "folder", node });
          return;
        }
        if (!node.blobPath) {
          if (!cancelled) setSettled({ token, status: "gone" });
          return;
        }
        const blob = await getBlob(node.blobPath);
        if (cancelled) return;
        if (!blob) {
          setSettled({ token, status: "gone" });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSettled({ token, status: "file", node, url: objectUrl });
      } catch {
        if (!cancelled) setSettled({ token, status: "gone" });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  const state: LoadState =
    settled && settled.token === token ? settled : { status: "loading" };

  return (
    // Exact viewport height so the viewer's scroll region is bounded and
    // scrolls INTERNALLY (page stepper + thumbnails call scrollTo on it) —
    // without this the whole page scrolls on <body> and paging is a no-op.
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Slim public header — the Acme mark plus the shared object. No user
          menu or trash: an anonymous visitor has no account surface. */}
      <header className="z-30 shrink-0 border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Acme Corp. home"
            className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
          >
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="size-9 shrink-0 rounded-lg ring-1 ring-foreground/10 ring-inset"
            />
            <span className="flex items-baseline gap-2">
              <span className="font-heading text-[15px] font-semibold">
                Acme Corp.
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Dataroom
              </span>
            </span>
          </Link>
          {(state.status === "file" || state.status === "folder") && (
            <span className="hidden min-w-0 flex-1 items-center gap-2 truncate text-sm text-muted-foreground md:flex">
              {state.status === "folder" ? (
                <Folder className="size-4 shrink-0" strokeWidth={1.75} />
              ) : (
                <FileText className="size-4 shrink-0" strokeWidth={1.75} />
              )}
              <span className="truncate" title={state.node.name}>
                {state.node.name}
              </span>
            </span>
          )}
          {state.status === "file" && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="ml-auto shrink-0"
            >
              <a href={state.url} download={state.node.name}>
                <Download /> Download
              </a>
            </Button>
          )}
          <div
            className={
              state.status === "file" ? "shrink-0" : "ml-auto shrink-0"
            }
          >
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-h-0 max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
        {state.status === "loading" && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2
              className="size-5 animate-spin"
              aria-label="Loading shared content"
            />
          </div>
        )}

        {state.status === "gone" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-tile bg-muted text-muted-foreground">
              <FileText className="size-6" strokeWidth={1.75} />
            </span>
            <div className="space-y-1">
              <h1 className="font-heading text-lg font-semibold">
                This link isn&apos;t available
              </h1>
              <p className="max-w-sm text-sm text-muted-foreground">
                It may have been unshared, moved, or deleted. Ask whoever sent
                it for a fresh link.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Go to Acme Dataroom</Link>
            </Button>
          </div>
        )}

        {state.status === "folder" && (
          <>
            <h1 className="sr-only">{state.node.name}</h1>
            {/* useSearchParams (the ?folder= param) needs a Suspense boundary
                in production builds. */}
            <Suspense fallback={<ListSkeleton variant="rows" count={4} />}>
              <SharedFolderView token={token} root={state.node} />
            </Suspense>
          </>
        )}

        {state.status === "file" && !canvasFailed && (
          <PdfCanvasViewer
            url={state.url}
            onRenderError={() => setFailedToken(token)}
            watermark={{ title: "Confidential" }}
          />
        )}

        {state.status === "file" && canvasFailed && (
          <>
            <iframe
              src={state.url}
              title={state.node.name}
              className="min-h-0 w-full flex-1 rounded-lg border bg-white dark:border-line-strong"
            />
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Can&apos;t preview?{" "}
              <a
                href={state.url}
                download={state.node.name}
                className="font-medium text-brand hover:underline"
              >
                Download the file
              </a>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
