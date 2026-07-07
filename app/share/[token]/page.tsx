"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Download, FileText, Loader2 } from "lucide-react";
import { getBlob, getSharedFile, type SharedFile } from "@/lib/storage";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PdfCanvasViewer } from "@/components/pdf-canvas-viewer";

type LoadState =
  | { status: "loading" }
  | { status: "gone" }
  | { status: "ready"; file: SharedFile; url: string };

/**
 * Public, sign-in-free view of a single shared file. The token in the URL is
 * the capability: getSharedFile resolves it through a SECURITY DEFINER RPC and
 * getBlob downloads under the anon storage policy. The document renders in the
 * same PdfCanvasViewer the authenticated app uses, so a share link opens into
 * the product's real reading UI — one click, no friction.
 */
export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // pdf.js couldn't parse this document — fall back to the browser renderer.
  const [canvasFailed, setCanvasFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: "loading" });
    setCanvasFailed(false);

    void (async () => {
      try {
        const file = await getSharedFile(token);
        if (!file) {
          if (!cancelled) setState({ status: "gone" });
          return;
        }
        const blob = await getBlob(file.blobPath);
        if (cancelled) return;
        if (!blob) {
          setState({ status: "gone" });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", file, url: objectUrl });
      } catch {
        if (!cancelled) setState({ status: "gone" });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Slim public header — the Acme mark plus a Confidential marker. No
          user menu or trash: an anonymous visitor has no account surface. */}
      <header className="sticky top-0 z-30 border-b bg-card">
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
          {state.status === "ready" && (
            <>
              <span className="hidden min-w-0 flex-1 items-center gap-2 truncate text-sm text-muted-foreground md:flex">
                <FileText className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate" title={state.file.name}>
                  {state.file.name}
                </span>
              </span>
              <Button variant="outline" size="sm" asChild className="ml-auto shrink-0">
                <a href={state.url} download={state.file.name}>
                  <Download /> Download
                </a>
              </Button>
            </>
          )}
          <div className={state.status === "ready" ? "shrink-0" : "ml-auto shrink-0"}>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
        {state.status === "loading" && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-label="Loading document" />
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
                The file may have been unshared, moved, or deleted. Ask whoever
                sent it for a fresh link.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Go to Acme Dataroom</Link>
            </Button>
          </div>
        )}

        {state.status === "ready" && !canvasFailed && (
          <PdfCanvasViewer
            url={state.url}
            onRenderError={() => setCanvasFailed(true)}
            watermark={{ title: "Confidential" }}
          />
        )}

        {state.status === "ready" && canvasFailed && (
          <>
            <iframe
              src={state.url}
              title={state.file.name}
              className="min-h-0 w-full flex-1 rounded-lg border bg-white dark:border-line-strong"
            />
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Can&apos;t preview?{" "}
              <a
                href={state.url}
                download={state.file.name}
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
