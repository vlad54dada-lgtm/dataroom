"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

interface PdfCanvasViewerProps {
  /** Object URL of the PDF blob. */
  url: string;
  /** Fires when pdf.js can't parse the document — caller shows a fallback. */
  onRenderError: () => void;
}

/**
 * Product-grade PDF viewer on pdf.js: continuous scroll, fit-width zoom
 * with +/- controls, and a live "Page X of N" indicator. Pages render
 * lazily as they approach the viewport and re-render on zoom; rendering
 * happens on canvas, so it also works where iframe PDFs don't (iOS).
 */
export function PdfCanvasViewer({ url, onRenderError }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Mirrors the ref as state so children can receive the element as a prop
  // (reading a ref during render is off-limits).
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  // Page-1 size at scale 1 — the fit-width baseline and the placeholder
  // size for pages that haven't rendered yet.
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);

  const onErrorRef = useRef(onRenderError);
  useEffect(() => {
    onErrorRef.current = onRenderError;
  });

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const task = pdfjs.getDocument({ url });
        destroy = () => void task.destroy().catch(() => undefined);
        const loaded = await task.promise;
        if (cancelled) return;
        const first = await loaded.getPage(1);
        if (cancelled) return;
        const vp = first.getViewport({ scale: 1 });
        const cw = containerRef.current?.clientWidth ?? 800;
        setBaseSize({ w: vp.width, h: vp.height });
        setFitScale(Math.min(Math.max((cw - 32) / vp.width, 0.3), 2));
        setDoc(loaded);
      } catch {
        if (!cancelled) onErrorRef.current();
      }
    })();
    return () => {
      cancelled = true;
      setDoc(null);
      setBaseSize(null);
      setZoom(1);
      setPage(1);
      destroy?.();
    };
  }, [url]);

  // The topmost page crossing the viewport's middle is "the current page".
  const handleScroll = () => {
    const c = containerRef.current;
    if (!c) return;
    const mid = c.scrollTop + c.clientHeight / 2;
    let current = 1;
    pageRefs.current.forEach((el, i) => {
      if (el && el.offsetTop <= mid) current = i + 1;
    });
    setPage(current);
  };

  // Fit-width follows the container: rotating a phone or resizing the
  // window re-derives the base scale instead of leaving stale page sizes.
  useEffect(() => {
    if (!containerEl || !baseSize) return;
    const observer = new ResizeObserver(() => {
      const width = containerEl.clientWidth;
      if (width > 0) {
        setFitScale(Math.min(Math.max((width - 32) / baseSize.w, 0.3), 2));
      }
    });
    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [containerEl, baseSize]);

  // Paging keys work as soon as the document is ready — the scroll region
  // takes focus so PgUp/PgDn/arrows scroll it, and +/-/0 drive the zoom.
  useEffect(() => {
    if (doc && containerEl) containerEl.focus({ preventScroll: true });
  }, [doc, containerEl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
    } else if (e.key === "-") {
      e.preventDefault();
      setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
    } else if (e.key === "0") {
      e.preventDefault();
      setZoom(1);
    }
  };

  const scale = fitScale * zoom;

  if (!doc || !baseSize) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-label="Loading PDF" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          Page {page} of {doc.numPages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM))}
          >
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM))}
          >
            <Plus />
          </Button>
        </div>
      </div>
      <div
        ref={(el) => {
          containerRef.current = el;
          setContainerEl(el);
        }}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="document"
        aria-label="Document pages"
        className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {/* Keyed by url: a new document never inherits stale canvases. */}
        <div key={url} className="flex flex-col items-center gap-3 p-4">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
            >
              <PageCanvas
                doc={doc}
                pageNumber={i + 1}
                scale={scale}
                estWidth={baseSize.w * scale}
                estHeight={baseSize.h * scale}
                container={containerEl}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PageCanvas = memo(function PageCanvas({
  doc,
  pageNumber,
  scale,
  estWidth,
  estHeight,
  container,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  estWidth: number;
  estHeight: number;
  container: HTMLDivElement | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // First pages render immediately; the rest wait until they scroll near.
  const [visible, setVisible] = useState(pageNumber <= 2);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderedScaleRef = useRef(0);

  // Observed BOTH ways: pages release their canvas memory when they leave
  // the (generous) margin, so a 200-page contract never accumulates
  // gigabytes of rendered bitmaps. The wrapper keeps its estimated size,
  // so releasing a page never shifts the scroll position.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !container) return;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { root: container, rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [container]);

  useEffect(() => {
    if (!visible) {
      const canvas = canvasRef.current;
      if (canvas && renderedScaleRef.current !== 0) {
        renderTaskRef.current?.cancel();
        canvas.width = 0;
        canvas.height = 0;
        canvas.style.width = "";
        canvas.style.height = "";
        renderedScaleRef.current = 0;
      }
      return;
    }
    if (renderedScaleRef.current === scale) return;
    let cancelled = false;
    void (async () => {
      try {
        const pg = await doc.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vpCss = pg.getViewport({ scale });
        const vpDev = pg.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(vpDev.width);
        canvas.height = Math.floor(vpDev.height);
        canvas.style.width = `${Math.floor(vpCss.width)}px`;
        canvas.style.height = `${Math.floor(vpCss.height)}px`;
        renderTaskRef.current?.cancel();
        const task = pg.render({ canvas, viewport: vpDev });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) renderedScaleRef.current = scale;
      } catch {
        // Render was cancelled mid-flight (zoom change, unmount) — the
        // next effect run repaints; a genuinely broken page keeps its
        // placeholder while the rest of the document stays readable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, scale, doc, pageNumber]);

  useEffect(() => {
    return () => renderTaskRef.current?.cancel();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="bg-white shadow-sm"
      style={{ minWidth: estWidth, minHeight: estHeight }}
    >
      <canvas ref={canvasRef} className="block" aria-label={`Page ${pageNumber}`} />
    </div>
  );
});
