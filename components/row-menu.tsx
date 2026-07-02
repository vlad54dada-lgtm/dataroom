"use client";

import { useRef } from "react";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RowMenuProps {
  /** Callbacks receive the kebab element so dialogs can restore focus to it. */
  onRename: (trigger: HTMLElement | null) => void;
  onDelete: (trigger: HTMLElement | null) => void;
  className?: string;
}

/** Shared kebab menu for dataroom cards and table rows. */
export function RowMenu({ onRename, onDelete, className }: RowMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-sm"
          aria-label="More actions"
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      {/* Both actions open a dialog that takes focus; returning focus to the
          kebab would race the dialog's autofocus and clobber its selection. */}
      <DropdownMenuContent
        align="end"
        className="w-40"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onSelect={() => onRename(triggerRef.current)}>
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDelete(triggerRef.current)}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
