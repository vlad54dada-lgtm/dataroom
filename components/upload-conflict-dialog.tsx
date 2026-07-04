"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UploadConflictDialogProps {
  open: boolean;
  /** How many incoming files collide with existing ones. */
  count: number;
  /** The (first) colliding file name — the single-conflict title names it. */
  firstName: string;
  onNewVersion: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}

/**
 * Same-named PDFs were dropped into a folder that already has them. In due
 * diligence that almost always means a NEW REVISION of the same document,
 * so "Upload as new version" leads; "Keep both" falls back to the (1)
 * suffix policy. One decision covers the whole batch, asked BEFORE the
 * queue starts — uploads never stop mid-flight to ask questions.
 */
export function UploadConflictDialog({
  open,
  count,
  firstName,
  onNewVersion,
  onKeepBoth,
  onCancel,
}: UploadConflictDialogProps) {
  // Freeze content through the exit animation (count drops to 0 the moment
  // the dialog closes) — same held-copy pattern as the selection bar.
  const [held, setHeld] = useState({ count, firstName });
  if (open && (held.count !== count || held.firstName !== firstName)) {
    setHeld({ count, firstName });
  }
  const shownCount = open ? count : held.count;
  const shownName = open ? firstName : held.firstName;
  const many = shownCount > 1;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {many
              ? `${shownCount} files already exist here`
              : `“${shownName}” already exists here`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {many
              ? "Upload them as new versions to keep each document's history in one place — the current copies stay restorable — or keep both copies side by side."
              : "Upload it as a new version to keep the document's history in one place — the current copy stays restorable — or keep both copies side by side."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={onKeepBoth}>
            Keep both
          </Button>
          <Button onClick={onNewVersion}>
            {many ? "Upload as new versions" : "Upload as new version"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
