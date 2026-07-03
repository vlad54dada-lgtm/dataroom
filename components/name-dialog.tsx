"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDuplicateNameError } from "@/lib/storage";
import { shake } from "@/lib/shake";
import { MAX_NAME_LENGTH, normalizeName, splitExtension } from "@/lib/utils";

type NameDialogMode = "create" | "rename";
type NameDialogEntity = "dataroom" | "folder" | "file";

interface NameDialogProps {
  open: boolean;
  mode: NameDialogMode;
  entity: NameDialogEntity;
  /** Current name when renaming. */
  initialName?: string;
  /** Throws DuplicateNameError to render inline; anything else keeps the dialog open. */
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
  /** Element to focus when the dialog closes (e.g. the row's kebab). */
  returnFocusTo?: HTMLElement | null;
}

const TITLE: Record<NameDialogMode, Record<NameDialogEntity, string>> = {
  create: {
    dataroom: "Create dataroom",
    folder: "Create folder",
    file: "Create file",
  },
  rename: {
    dataroom: "Rename dataroom",
    folder: "Rename folder",
    file: "Rename file",
  },
};

/**
 * The single dialog behind every create/rename flow. Enter submits, Esc
 * closes, the input autofocuses (text pre-selected on rename; base name only
 * for files). The confirm button is always pressable — submitting an empty
 * or invalid name answers with a shake + inline error instead of a silently
 * disabled button, and duplicate errors render the same way.
 *
 * State resets by REMOUNT: the parent passes a `key` derived from the dialog
 * target (e.g. `create` / `rename:<id>`), so each open starts fresh without
 * effect-driven resets.
 */
export function NameDialog({
  open,
  mode,
  entity,
  initialName = "",
  onSubmit,
  onClose,
  returnFocusTo,
}: NameDialogProps) {
  const [value, setValue] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = normalizeName(value);
  const showEmptyHint = value.length > 0 && normalized.length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    // Invalid name: the form physically says "no" instead of the button
    // silently refusing to work.
    if (normalized.length === 0 || normalized.length > MAX_NAME_LENGTH) {
      setError(
        value.length > 0
          ? "Name can't be only spaces"
          : `Enter a ${entity} name`,
      );
      shake(inputRef.current);
      inputRef.current?.focus();
      return;
    }
    // Renaming to the unchanged name is a no-op: just close, no toast.
    if (mode === "rename" && normalized === initialName) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(normalized);
      onClose();
    } catch (err) {
      if (isDuplicateNameError(err)) {
        setError(err.message);
        shake(inputRef.current);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // Other errors were toasted by the mutation; keep the dialog open.
      setSubmitting(false);
    }
  };

  const focusInput = (event: Event) => {
    event.preventDefault();
    // Deferred one frame: Radix's focus scope does its own focus pass after
    // this handler and would clobber a synchronous selection.
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (mode === "rename") {
        if (entity === "file") {
          // Pre-select the base name so typing replaces it but keeps ".pdf".
          const { base } = splitExtension(initialName);
          input.setSelectionRange(0, base.length);
        } else {
          input.select();
        }
      }
    });
  };

  // Dialogs open programmatically (no Radix Trigger), so Radix can't know
  // where focus came from — restore it to the captured trigger ourselves.
  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  return (
    // While a submit is in flight the dialog refuses to close — Esc,
    // overlay clicks, and the X would leave the mutation racing a closed
    // dialog and the result landing with no context.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        if (!next) onClose();
      }}
    >
      <DialogContent
        onOpenAutoFocus={focusInput}
        onCloseAutoFocus={restoreFocus}
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{TITLE[mode][entity]}</DialogTitle>
            <DialogDescription className="sr-only">
              Enter a name, then press Enter or use the confirm button.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name-dialog-input">Name</Label>
            <Input
              id="name-dialog-input"
              ref={inputRef}
              value={value}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {error ? (
              <p
                className="text-sm text-danger motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
                role="alert"
              >
                {error}
              </p>
            ) : showEmptyHint ? (
              <p className="text-sm text-muted-foreground">
                Name can&apos;t be only spaces
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {mode === "create" ? TITLE.create[entity] : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
