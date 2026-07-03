"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
import { MAX_NAME_LENGTH, cn, normalizeName } from "@/lib/utils";
import {
  ROOM_COLOR_KEYS,
  ROOM_COLORS,
  ROOM_ICONS,
  ROOM_ICON_KEYS,
  RoomAvatar,
} from "@/components/room-avatar";

const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Sliding selection indicator (the segmented-control pattern, extended to
 * 2D grids): one absolutely-positioned pill per picker glides to whichever
 * sibling holds aria-pressed="true". Measured with offset* so the dialog's
 * entrance transform never skews the math; the first paint and container
 * resizes write the position with the transition suspended, so the pill
 * only ever animates on a real selection change.
 */
function useGlideIndicator(selected: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const hasPositioned = useRef(false);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  const position = useCallback((animate: boolean): boolean => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return false;
    const target = container.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (!target) return false;
    const write = () => {
      pill.style.opacity = "1";
      pill.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
      pill.style.width = `${target.offsetWidth}px`;
      pill.style.height = `${target.offsetHeight}px`;
    };
    if (animate) {
      write();
    } else {
      pill.style.transition = "none";
      write();
      void pill.offsetWidth; // commit the jump before re-enabling the tween
      pill.style.transition = "";
    }
    return true;
  }, []);

  const setPill = useCallback((node: HTMLSpanElement | null) => {
    pillRef.current = node;
  }, []);

  // Callback ref, not an effect: the pickers live inside the dialog portal,
  // which mounts long after this component does — so position on attach.
  const setContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      resizeObserver.current?.disconnect();
      resizeObserver.current = null;
      if (!node) {
        hasPositioned.current = false;
        return;
      }
      hasPositioned.current = position(false);
      const ro = new ResizeObserver(() => position(false));
      ro.observe(node);
      resizeObserver.current = ro;
    },
    [position],
  );

  useLayoutEffect(() => {
    if (position(hasPositioned.current)) hasPositioned.current = true;
  }, [selected, position]);

  return [setContainer, setPill] as const;
}

export interface DataroomValues {
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

interface DataroomDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: DataroomValues;
  /** Throws DuplicateNameError to render inline; anything else keeps the dialog open. */
  onSubmit: (values: DataroomValues) => Promise<void>;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

/**
 * Create/edit a dataroom: name, optional description, and an avatar picked
 * from a curated icon × color set with a live preview. State resets by
 * remount via `key` from the parent.
 */
export function DataroomDialog({
  open,
  mode,
  initial,
  onSubmit,
  onClose,
  returnFocusTo,
}: DataroomDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "folder");
  const [color, setColor] = useState(initial?.color ?? "blue");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [setIconGrid, setIconPill] = useGlideIndicator(icon);
  const [setColorRow, setColorPill] = useGlideIndicator(color);

  const normalized = normalizeName(name);
  const canSubmit =
    normalized.length > 0 && normalized.length <= MAX_NAME_LENGTH && !submitting;
  const showEmptyHint = name.length > 0 && normalized.length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: normalized,
        description: description.trim() || null,
        icon,
        color,
      });
      onClose();
    } catch (err) {
      if (isDuplicateNameError(err)) {
        setError(err.message);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      setSubmitting(false);
    }
  };

  const focusInput = (event: Event) => {
    event.preventDefault();
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (mode === "edit") input.select();
    });
  };

  const restoreFocus = (event: Event) => {
    if (returnFocusTo?.isConnected) {
      event.preventDefault();
      returnFocusTo.focus();
    }
  };

  return (
    // Closing is blocked while a submit is in flight (Esc/overlay/X).
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
        className="sm:max-w-md"
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Create dataroom" : "Edit dataroom"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Name the dataroom, add an optional description, and pick its
              icon and color.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-3">
            <RoomAvatar icon={icon} color={color} className="mt-6" animateSwaps />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="dataroom-name">Name</Label>
              <Input
                id="dataroom-name"
                ref={inputRef}
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : showEmptyHint ? (
                <p className="text-sm text-muted-foreground">
                  Name can&apos;t be only spaces
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dataroom-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <textarea
              id="dataroom-description"
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What lives in this room, e.g. legal contracts for the Acme acquisition"
              className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Icon</Label>
            <div
              ref={setIconGrid}
              className="relative grid grid-cols-6 gap-1.5"
            >
              <span
                ref={setIconPill}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 rounded-lg border border-ring bg-folder-bg opacity-0 will-change-transform motion-safe:transition-[transform,width,height] motion-safe:duration-300 motion-safe:ease-out-strong"
              />
              {ROOM_ICON_KEYS.map((key) => {
                const Icon = ROOM_ICONS[key];
                const selected = icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${key} icon`}
                    aria-pressed={selected}
                    onClick={() => setIcon(key)}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-lg border border-transparent transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "text-brand"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon
                      key={String(selected)}
                      className={cn(
                        "size-4.5",
                        selected &&
                          "motion-safe:animate-in motion-safe:fade-in-50 motion-safe:zoom-in-75 motion-safe:duration-200 motion-safe:ease-out-back",
                      )}
                      strokeWidth={1.75}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div
              ref={setColorRow}
              className="relative flex flex-wrap gap-2"
            >
              <span
                ref={setColorPill}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 rounded-full ring-2 ring-ring ring-offset-2 ring-offset-popover opacity-0 will-change-transform motion-safe:transition-[transform,width,height] motion-safe:duration-300 motion-safe:ease-out-strong"
              />
              {ROOM_COLOR_KEYS.map((key) => {
                const selected = color === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${key} color`}
                    aria-pressed={selected}
                    onClick={() => setColor(key)}
                    className={cn(
                      "size-6 rounded-full transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      ROOM_COLORS[key].swatch,
                      !selected && "hover:scale-110",
                    )}
                  />
                );
              })}
            </div>
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
            <Button type="submit" disabled={!canSubmit}>
              {submitting && <Loader2 className="animate-spin" />}
              {mode === "create" ? "Create dataroom" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
