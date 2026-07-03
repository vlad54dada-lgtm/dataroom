"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
/** Find-in-document stops counting here — enough for any real query. */
const MAX_MATCHES = 500;

interface PdfMatch {
  page: number;
  start: number;
  end: number;
}

/** A rendered page's text layer, aligned arrays: divs[i] renders strs[i]. */
interface PageTextLayer {
  strs: string[];
  divs: HTMLElement[];
}

interface PdfCanvasViewerProps {
  /** Object URL of the PDF blob. */
  url: string;
  /** Fires when pdf.js can't parse the document — caller shows a fallback. */
  onRenderError: () => void;
  /**
   * Diagonal per-page overlay — the classic data-room deterrent: every
   * page carries who was looking at it. Title big, subtitle (the viewer's
   * email) smaller beneath.
   */
  watermark?: { title: string; subtitle?: string };
}

/**
 * Product-grade PDF viewer on pdf.js: continuous scroll, fit-width zoom
 * with +/- controls, and a live "Page X of N" indicator. Pages render
 * lazily as they approach the viewport and re-render on zoom; rendering
 * happens on canvas, so it also works where iframe PDFs don't (iOS).
 */
export function PdfCanvasViewer({
  url,
  onRenderError,
  watermark,
}: PdfCanvasViewerProps) {
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

  // Find in document: query → matches over extracted page texts → marks
  // painted into the rendered pages' text layers.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [matches, setMatches] = useState<PdfMatch[]>([]);
  const [current, setCurrent] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pageTextsRef = useRef<string[] | null>(null);
  const layersRef = useRef(new Map<number, PageTextLayer>());
  const markedDivsRef = useRef(new Map<number, Set<number>>());

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
      pageTextsRef.current = null;
      layersRef.current.clear();
      markedDivsRef.current.clear();
      setSearchOpen(false);
      setSearchInput("");
      setSearchQ("");
      setMatches([]);
      setCurrent(0);
      destroy?.();
    };
  }, [url]);

  // Keystrokes settle before the document-wide scan runs.
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput), 180);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Extract every page's text once per document (lazily, on first query),
  // then index all case-insensitive occurrences.
  useEffect(() => {
    const q = searchQ.trim().toLowerCase();
    if (!doc || q.length === 0) {
      setMatches([]);
      setCurrent(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!pageTextsRef.current) {
          const texts: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const content = await (await doc.getPage(i)).getTextContent();
            if (cancelled) return;
            texts.push(
              content.items
                .map((it) => ("str" in it ? it.str : ""))
                .join(""),
            );
          }
          pageTextsRef.current = texts;
        }
        const found: PdfMatch[] = [];
        outer: for (let pi = 0; pi < pageTextsRef.current.length; pi++) {
          const hay = pageTextsRef.current[pi].toLowerCase();
          let idx = 0;
          let at: number;
          while ((at = hay.indexOf(q, idx)) !== -1) {
            found.push({ page: pi + 1, start: at, end: at + q.length });
            idx = at + q.length;
            if (found.length >= MAX_MATCHES) break outer;
          }
        }
        if (!cancelled) {
          setMatches(found);
          setCurrent(0);
        }
      } catch {
        // Text extraction failed — find quietly reports zero matches; the
        // document itself still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, searchQ]);

  /**
   * Paint the query's occurrences into one page's text layer. Previous
   * marks are undone first (the layer arrays are the source of truth for
   * original text), then per-div mark ranges rebuild each affected span.
   */
  const highlightPage = (pageNumber: number) => {
    const layer = layersRef.current.get(pageNumber);
    if (!layer) return;
    const { strs, divs } = layer;
    const prev = markedDivsRef.current.get(pageNumber);
    if (prev) {
      for (const i of prev) if (divs[i]) divs[i].textContent = strs[i];
    }
    const marked = new Set<number>();
    markedDivsRef.current.set(pageNumber, marked);
    const q = searchQ.trim().toLowerCase();
    if (!q) return;
    const cur = matches[current];
    const starts: number[] = [];
    let acc = 0;
    for (const s of strs) {
      starts.push(acc);
      acc += s.length;
    }
    const hay = strs.join("").toLowerCase();
    // Collect ranges per div first — a div can host several matches, and
    // rebuilding once per div keeps earlier marks intact.
    const perDiv = new Map<
      number,
      { from: number; to: number; isCurrent: boolean }[]
    >();
    let idx = 0;
    let at: number;
    let di = 0;
    while ((at = hay.indexOf(q, idx)) !== -1) {
      const isCurrent =
        !!cur && cur.page === pageNumber && cur.start === at;
      while (di < strs.length && starts[di] + strs[di].length <= at) di++;
      let segStart = at;
      const segEnd = at + q.length;
      let dj = di;
      while (segStart < segEnd && dj < strs.length) {
        const from = Math.max(0, segStart - starts[dj]);
        const to = Math.min(strs[dj].length, segEnd - starts[dj]);
        if (to > from) {
          let list = perDiv.get(dj);
          if (!list) perDiv.set(dj, (list = []));
          list.push({ from, to, isCurrent });
        }
        segStart = starts[dj] + strs[dj].length;
        dj++;
      }
      idx = at + q.length;
    }
    for (const [divIndex, ranges] of perDiv) {
      const div = divs[divIndex];
      if (!div) continue;
      const text = strs[divIndex];
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const r of ranges.sort((a, b) => a.from - b.from)) {
        if (r.from > pos) frag.append(text.slice(pos, r.from));
        const mark = document.createElement("mark");
        mark.className = r.isCurrent
          ? "pdf-mark pdf-mark-current"
          : "pdf-mark";
        mark.textContent = text.slice(r.from, r.to);
        frag.append(mark);
        pos = r.to;
      }
      if (pos < text.length) frag.append(text.slice(pos));
      div.replaceChildren(frag);
      marked.add(divIndex);
    }
  };
  const highlightPageRef = useRef(highlightPage);
  highlightPageRef.current = highlightPage;

  const scrollCurrentMarkIntoView = () => {
    const mark = containerRef.current?.querySelector("mark.pdf-mark-current");
    if (!mark) return false;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    mark.scrollIntoView({
      block: "center",
      behavior: reduce ? "auto" : "smooth",
    });
    return true;
  };
  const scrollCurrentMarkRef = useRef(scrollCurrentMarkIntoView);
  scrollCurrentMarkRef.current = scrollCurrentMarkIntoView;

  // Repaint every rendered page when the query or active match changes,
  // then bring the active match into view (or its page, if not rendered
  // yet — the page registers its layer on render and finishes the job).
  const scrollToPageRef = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    for (const pageNumber of layersRef.current.keys()) {
      highlightPageRef.current(pageNumber);
    }
    const cur = matches[current];
    if (!cur) return;
    if (!scrollCurrentMarkRef.current()) scrollToPageRef.current(cur.page);
  }, [matches, current]);

  // Stable identity so the memoized PageCanvas never re-renders because of
  // the callback; the ref hop reads fresh state.
  const onTextLayer = useCallback((pageNumber: number, layer: PageTextLayer | null) => {
    if (layer) {
      layersRef.current.set(pageNumber, layer);
      markedDivsRef.current.delete(pageNumber);
      highlightPageRef.current(pageNumber);
      scrollPendingRef.current?.(pageNumber);
    } else {
      layersRef.current.delete(pageNumber);
      markedDivsRef.current.delete(pageNumber);
    }
  }, []);
  // When a page renders and it hosts the active match, finish the pending
  // scroll that the effect above could only start.
  const scrollPendingRef = useRef<((pageNumber: number) => void) | null>(null);
  scrollPendingRef.current = (pageNumber: number) => {
    const cur = matches[current];
    if (cur && cur.page === pageNumber) scrollCurrentMarkRef.current();
  };

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchInput("");
    setSearchQ("");
    containerRef.current?.focus({ preventScroll: true });
  };
  const goNext = () =>
    setCurrent((c) => (matches.length ? (c + 1) % matches.length : 0));
  const goPrev = () =>
    setCurrent((c) =>
      matches.length ? (c - 1 + matches.length) % matches.length : 0,
    );

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

  const scrollToPage = (n: number) => {
    const target = pageRefs.current[n - 1];
    const container = containerRef.current;
    if (!target || !container) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    container.scrollTo({
      top: target.offsetTop - 12,
      behavior: reduce ? "auto" : "smooth",
    });
  };
  scrollToPageRef.current = scrollToPage;

  if (!doc || !baseSize) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-label="Loading PDF" />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      // The dialog reads this to keep Escape from closing it while the
      // find bar is open (Radix listens in capture phase on document, so
      // stopPropagation alone can't protect it).
      data-pdf-find-open={searchOpen ? "" : undefined}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          e.stopPropagation();
          openSearch();
        } else if (e.key === "Escape" && searchOpen) {
          e.stopPropagation();
          closeSearch();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Same anatomy as the header's "File X of Y" stepper — the
            matching shape plus the label is what tells pages from files. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => scrollToPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            Page {page} of {doc.numPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Next page"
            disabled={page >= doc.numPages}
            onClick={() => scrollToPage(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {searchOpen ? (
            <div className="flex min-w-0 items-center gap-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1 motion-safe:duration-150">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (e.shiftKey) goPrev();
                      else goNext();
                    }
                    // Escape is handled by the viewer root — it closes the
                    // find bar wherever focus is.
                  }}
                  placeholder="Find in document"
                  aria-label="Find in document"
                  className="h-7 w-40 min-w-0 pl-7 text-xs"
                />
              </div>
              <span
                role="status"
                className="w-14 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
              >
                {searchQ.trim()
                  ? `${matches.length ? current + 1 : 0} / ${matches.length}${
                      matches.length >= MAX_MATCHES ? "+" : ""
                    }`
                  : ""}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Previous match"
                disabled={matches.length === 0}
                onClick={goPrev}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Next match"
                disabled={matches.length === 0}
                onClick={goNext}
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close search"
                onClick={closeSearch}
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Find in document"
              title="Find in document (Ctrl+F)"
              onClick={openSearch}
            >
              <Search />
            </Button>
          )}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
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
        // `relative` anchors the pages' offsetTop to THIS container — the
        // scroll position math (current-page tracking, page stepper) reads
        // offsets against it, not the dialog.
        className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset dark:bg-canvas"
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
                watermark={watermark}
                onTextLayer={onTextLayer}
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
  watermark,
  onTextLayer,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  estWidth: number;
  estHeight: number;
  container: HTMLDivElement | null;
  watermark?: { title: string; subtitle?: string };
  /** Hands the rendered text layer to the viewer's find machinery. */
  onTextLayer?: (pageNumber: number, layer: PageTextLayer | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // First pages render immediately; the rest wait until they scroll near.
  const [visible, setVisible] = useState(pageNumber <= 2);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerRef = useRef<TextLayer | null>(null);
  const renderedScaleRef = useRef(0);
  const onTextLayerRef = useRef(onTextLayer);
  useEffect(() => {
    onTextLayerRef.current = onTextLayer;
  });

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
        textLayerRef.current?.cancel();
        textLayerRef.current = null;
        textRef.current?.replaceChildren();
        onTextLayerRef.current?.(pageNumber, null);
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
        if (cancelled) return;
        renderedScaleRef.current = scale;
        // Selectable text: an invisible pdf.js text layer over the canvas.
        // Re-rendered per scale — cheaper to rebuild than to keep in sync.
        const textDiv = textRef.current;
        if (textDiv) {
          const pdfjs = await import("pdfjs-dist");
          if (cancelled) return;
          textLayerRef.current?.cancel();
          textDiv.replaceChildren();
          textDiv.style.setProperty("--scale-factor", String(vpCss.scale));
          const textLayer = new pdfjs.TextLayer({
            textContentSource: pg.streamTextContent(),
            container: textDiv,
            viewport: vpCss,
          });
          textLayerRef.current = textLayer;
          await textLayer.render();
          if (!cancelled) {
            onTextLayerRef.current?.(pageNumber, {
              strs: textLayer.textContentItemsStr,
              divs: textLayer.textDivs,
            });
          }
        }
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
    return () => {
      renderTaskRef.current?.cancel();
      textLayerRef.current?.cancel();
      onTextLayerRef.current?.(pageNumber, null);
    };
    // pageNumber is fixed for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapRef}
      // Physical paper: hairline keyline + soft lift; in dark the keyline
      // does the edge work a border can't (outside the canvas, no shift).
      // `relative` anchors the text layer to the page sheet.
      className="relative bg-white shadow-paper"
      style={{ minWidth: estWidth, minHeight: estHeight }}
    >
      <canvas ref={canvasRef} className="block" aria-label={`Page ${pageNumber}`} />
      {/* Fixed gray, not a theme token: the page sheet is white in both
          themes. Sized off the page width so it scales with zoom; the
          subtitle truncates rather than spilling past the diagonal. */}
      {watermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center overflow-hidden select-none"
        >
          <div className="flex max-w-full -rotate-[28deg] flex-col items-center gap-1 text-gray-900/8">
            <span
              className="font-semibold tracking-[0.12em] whitespace-nowrap uppercase"
              style={{ fontSize: Math.max(estWidth / 14, 14) }}
            >
              {watermark.title}
            </span>
            {watermark.subtitle && (
              <span
                className="max-w-full overflow-hidden font-medium tracking-wide text-ellipsis whitespace-nowrap"
                style={{ fontSize: Math.max(estWidth / 34, 10) }}
              >
                {watermark.subtitle}
              </span>
            )}
          </div>
        </div>
      )}
      <div ref={textRef} className="textLayer" />
    </div>
  );
});
