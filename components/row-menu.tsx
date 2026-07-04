"use client";

import { useRef } from "react";
import {
  Download,
  EllipsisVertical,
  FileUp,
  FolderInput,
  History,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RowMenuProps {
  /** Callbacks receive the kebab element so dialogs can restore focus to it. */
  onRename: (trigger: HTMLElement | null) => void;
  onDelete: (trigger: HTMLElement | null) => void;
  /** File rows only: single-item download. */
  onDownload?: () => void;
  /** File rows only: replace content, keep name/id — history preserved. */
  onUploadVersion?: () => void;
  /** File rows only: opens the version history dialog. */
  onVersionHistory?: (trigger: HTMLElement | null) => void;
  /** Opens the Move to… destination picker for this item. */
  onMove?: (trigger: HTMLElement | null) => void;
  /** Dataroom cards say "Edit" (name + description + avatar), rows "Rename". */
  renameLabel?: string;
  /** Table rows have F2/Del key handlers — show the hints. Cards don't. */
  shortcutHints?: boolean;
  /** Names the object for assistive tech: "Actions for {subject}". */
  subject?: string;
  className?: string;
}

/** Shared kebab menu for dataroom cards and table rows. */
export function RowMenu({
  onRename,
  onDelete,
  onDownload,
  onUploadVersion,
  onVersionHistory,
  onMove,
  renameLabel = "Rename",
  shortcutHints = false,
  subject,
  className,
}: RowMenuProps) {
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
          aria-label={subject ? `Actions for ${subject}` : "More actions"}
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
        {onDownload && (
          // No dialog follows a download, so focus returns to the kebab.
          <DropdownMenuItem onSelect={() => onDownload()}>
            <Download /> Download
          </DropdownMenuItem>
        )}
        {onUploadVersion && (
          // The OS file picker follows — not a dialog of ours, focus stays.
          <DropdownMenuItem onSelect={() => onUploadVersion()}>
            <FileUp /> Upload new version
          </DropdownMenuItem>
        )}
        {onVersionHistory && (
          <DropdownMenuItem
            onSelect={() => {
              actionChosenRef.current = true;
              onVersionHistory(triggerRef.current);
            }}
          >
            <History /> Version history
          </DropdownMenuItem>
        )}
        {(onDownload || onUploadVersion || onVersionHistory) && (
          <DropdownMenuSeparator />
        )}
        <DropdownMenuItem
          onSelect={() => {
            actionChosenRef.current = true;
            onRename(triggerRef.current);
          }}
        >
          <Pencil /> {renameLabel}
          {shortcutHints && <DropdownMenuShortcut>F2</DropdownMenuShortcut>}
        </DropdownMenuItem>
        {onMove && (
          <DropdownMenuItem
            onSelect={() => {
              actionChosenRef.current = true;
              onMove(triggerRef.current);
            }}
          >
            <FolderInput /> Move to…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            actionChosenRef.current = true;
            onDelete(triggerRef.current);
          }}
        >
          <Trash2 /> Move to trash
          {shortcutHints && <DropdownMenuShortcut>Del</DropdownMenuShortcut>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
