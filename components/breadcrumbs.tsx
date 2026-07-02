"use client";

import Link from "next/link";
import { ChevronRight, Ellipsis } from "lucide-react";
import type { Node } from "@/types";
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
}

function Separator() {
  return (
    <ChevronRight
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden
    />
  );
}

function CrumbLink({ node, href }: { node: Node; href: string }) {
  return (
    <Link
      href={href}
      title={node.name}
      className="max-w-40 truncate rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
 */
export function Breadcrumbs({ crumbs, hrefFor }: BreadcrumbsProps) {
  if (crumbs.length === 0) return null;
  const current = crumbs[crumbs.length - 1];
  const ancestors = crumbs.slice(0, -1);
  const collapse = ancestors.length > 2;
  const head = collapse ? [ancestors[0]] : ancestors;
  const middle = collapse ? ancestors.slice(1) : [];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        <li className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Home
          </Link>
        </li>
        {head.map((node) => (
          <li key={node.id} className="flex min-w-0 items-center gap-1">
            <Separator />
            <CrumbLink node={node} href={hrefFor(node.id)} />
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
                  className="text-muted-foreground"
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
        <li className="flex min-w-0 items-center gap-1">
          <Separator />
          <span
            aria-current="page"
            title={current.name}
            className="max-w-56 truncate font-medium"
          >
            {current.name}
          </span>
        </li>
      </ol>
    </nav>
  );
}
