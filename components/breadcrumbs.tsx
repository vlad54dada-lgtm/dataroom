"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Ellipsis } from "lucide-react";
import type { Node } from "@/types";
import { MOVE_MIME, readIds } from "@/lib/dnd";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BreadcrumbsProps {
  /** Ancestor chain, room first, current folder last. */
  crumbs: Node[];
  hrefFor: (id: string) => string;
  /** Rows dragged onto an ancestor crumb move there. */
  onDropNodes?: (ids: string[], target: Node) => void;
  /** Warms a crumb's contents cache on hover so going back is instant. */
  onPrefetch?: (id: string) => void;
}

function Separator() {
  // `relative` lifts the chevron above the hover pill gliding beneath it.
  return (
    <ChevronRight
      className="relative size-4 shrink-0 text-muted-foreground"
      aria-hidden
    />
  );
}

function CrumbLink({
  node,
  href,
  onDropNodes,
  onHighlight,
  onPrefetch,
}: {
  node: Node;
  href: string;
  onDropNodes?: (ids: string[], target: Node) => void;
  /** Reports the hovered/focused element so the shared pill can slide to it. */
  onHighlight: (el: HTMLElement) => void;
  onPrefetch?: (id: string) => void;
}) {
  const [dropReady, setDropReady] = useState(false);
  return (
    <Link
      href={href}
      title={node.name}
      onPointerEnter={(e) => {
        onHighlight(e.currentTarget);
        onPrefetch?.(node.id);
      }}
      onFocus={(e) => onHighlight(e.currentTarget)}
      onDragOver={(e) => {
        if (!onDropNodes || !e.dataTransfer.types.includes(MOVE_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropReady(true);
      }}
      onDragLeave={() => setDropReady(false)}
      onDrop={(e) => {
        setDropReady(false);
        if (!onDropNodes) return;
        const ids = readIds(e.dataTransfer, MOVE_MIME);
        if (ids.length === 0 || ids.includes(node.id)) return;
        e.preventDefault();
        onDropNodes(ids, node);
      }}
      className={cn(
        "relative max-w-40 truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        dropReady && "bg-folder-bg text-brand ring-2 ring-brand",
      )}
    >
      {node.name}
    </Link>
  );
}

/**
 * Home / room / … / current. Every crumb except the last navigates; the last
 * is plain text with aria-current. Trails longer than three collapse the
 * middle into an ellipsis menu, keeping the room and the current folder
 * always visible.
 *
 * Hover feedback is one shared pill that slides between crumbs (tabs-sliding
 * pattern): it appears in place on first hover, then tweens transform/size
 * between targets, and fades out when the pointer leaves the trail.
 */
export function Breadcrumbs({
  crumbs,
  hrefFor,
  onDropNodes,
  onPrefetch,
}: BreadcrumbsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const pillOn = useRef(false);

  const showPill = (el: HTMLElement) => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const listBox = list.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const place = () => {
      pill.style.width = `${box.width}px`;
      pill.style.height = `${box.height}px`;
      pill.style.transform = `translate(${box.left - listBox.left}px, ${
        box.top - listBox.top
      }px)`;
    };
    if (pillOn.current) {
      place(); // visible pill: let the stylesheet transition do the slide
    } else {
      // First hover: land in place (no cross-screen slide), then fade in.
      pill.style.transition = "none";
      place();
      void pill.offsetWidth;
      pill.style.transition = "";
    }
    pill.style.opacity = "1";
    pillOn.current = true;
  };

  const hidePill = () => {
    const pill = pillRef.current;
    if (!pill) return;
    pill.style.opacity = "0";
    pillOn.current = false;
  };

  // Navigation rebuilds the trail — park the pill so it can't sit on a crumb
  // that just moved or disappeared.
  const trailKey = crumbs.map((c) => c.id).join("/");
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    pill.style.transition = "none";
    pill.style.opacity = "0";
    void pill.offsetWidth;
    pill.style.transition = "";
    pillOn.current = false;
  }, [trailKey]);

  if (crumbs.length === 0) return null;
  const current = crumbs[crumbs.length - 1];
  const ancestors = crumbs.slice(0, -1);
  const collapse = ancestors.length > 2;
  const head = collapse ? [ancestors[0]] : ancestors;
  const middle = collapse ? ancestors.slice(1) : [];

  return (
    <nav
      aria-label="Breadcrumb"
      className="min-w-0 flex-1"
      onPointerLeave={hidePill}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof HTMLElement) || !e.currentTarget.contains(next))
          hidePill();
      }}
    >
      <ol ref={listRef} className="relative flex min-w-0 items-center gap-1 text-sm">
        <span
          ref={pillRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-md bg-muted opacity-0 transition-[transform,width,height,opacity] duration-200 ease-out-strong will-change-[transform,width] motion-reduce:transition-none"
        />
        <li className="flex items-center gap-1">
          <Link
            href="/"
            onPointerEnter={(e) => showPill(e.currentTarget)}
            onFocus={(e) => showPill(e.currentTarget)}
            className="relative rounded-md px-1.5 py-1 text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Home
          </Link>
        </li>
        {head.map((node) => (
          <li key={node.id} className="flex min-w-0 items-center gap-1">
            <Separator />
            <CrumbLink
              node={node}
              href={hrefFor(node.id)}
              onDropNodes={onDropNodes}
              onHighlight={showPill}
              onPrefetch={onPrefetch}
            />
          </li>
        ))}
        {middle.length > 0 && (
          <li className="flex items-center gap-1">
            <Separator />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Show hidden folders"
                  onPointerEnter={(e) => showPill(e.currentTarget)}
                  onFocus={(e) => showPill(e.currentTarget)}
                  className="relative text-muted-foreground hover:bg-transparent dark:hover:bg-transparent"
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {middle.map((node) => (
                  <DropdownMenuItem key={node.id} asChild>
                    <Link href={hrefFor(node.id)} title={node.name}>
                      <span className="truncate">{node.name}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
        {/* Keyed by folder: navigating slides the new location in from the
            trail's direction of travel. */}
        <li
          key={current.id}
          className="flex min-w-0 items-center gap-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-300 motion-safe:ease-out-strong"
        >
          <Separator />
          <span
            aria-current="page"
            title={current.name}
            className="relative max-w-56 truncate px-1.5 py-1 font-medium"
          >
            {current.name}
          </span>
        </li>
      </ol>
    </nav>
  );
}
