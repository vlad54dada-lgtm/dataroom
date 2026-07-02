"use client";

import { useState } from "react";
import type { DeleteCounts, Node } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteDialogProps {
  open: boolean;
  target: Node | null;
  /** Descendant counts; null while loading (files never need them). */
  counts: DeleteCounts | null;
  /** Errors are surfaced via the mutation's toast; the dialog always closes. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function describe(target: Node, counts: DeleteCounts | null): string {
  if (target.type === "file") return "This can't be undone.";
  if (!counts) return " "; // keep height stable while counts load
  const { folders, files } = counts;
  if (folders + files === 0) {
    return `This ${target.type === "dataroom" ? "dataroom" : "folder"} is empty. This can't be undone.`;
  }
  const parts =
    folders > 0 && files > 0
      ? `${plural(folders, "folder")} and ${plural(files, "file")}`
      : folders > 0
        ? plural(folders, "folder")
        : plural(files, "file");
  return `This will permanently delete ${parts}.`;
}

/**
 * Destructive confirm. Focus lands on Cancel by default (DOM order), so Enter
 * never deletes by accident; Esc closes.
 */
export function DeleteDialog({
  open,
  target,
  counts,
  onConfirm,
  onClose,
}: DeleteDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault(); // keep the dialog mounted until the action settles
    setPending(true);
    try {
      await onConfirm();
    } catch {
      // Surfaced via the mutation's error toast.
    } finally {
      setPending(false);
      onClose();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        {target ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="line-clamp-2 [overflow-wrap:anywhere]">
                Delete &ldquo;{target.name}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {describe(target, counts)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={handleConfirm}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
