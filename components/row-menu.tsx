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
  // Written only inside event handlers (never during render).
  const actionChosenRef = useRef(false);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) actionChosenRef.current = false;
      }}
    >
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
      {/* When an action was chosen, a dialog is about to take focus —
          returning it to the kebab would race the dialog's autofocus and
          clobber its text selection. A plain Esc/click-away close restores
          focus to the kebab as keyboard users expect. */}
      <DropdownMenuContent
        align="end"
        className="w-40"
        onCloseAutoFocus={(e) => {
          if (actionChosenRef.current) e.preventDefault();
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            actionChosenRef.current = true;
            onRename(triggerRef.current);
          }}
        >
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            actionChosenRef.current = true;
            onDelete(triggerRef.current);
          }}
        >
          <Trash2 /> Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
