import {
  FolderOpen,
  FolderPlus,
  SearchX,
  Trash2,
  type LucideIcon,
} from "lucide-react";

type EmptyStateVariant =
  | "no-datarooms"
  | "empty-folder"
  | "no-results"
  | "trash-empty";

const COPY: Record<
  EmptyStateVariant,
  { icon: LucideIcon; title: string; description: string }
> = {
  "no-datarooms": {
    icon: FolderPlus,
    title: "No datarooms yet",
    description: "Create a dataroom to organize your deal documents.",
  },
  "empty-folder": {
    icon: FolderOpen,
    title: "This folder is empty",
    description: "Drop PDF files here or create a folder.",
  },
  "no-results": {
    icon: SearchX,
    title: "No matches",
    description: "Try a different name.",
  },
  "trash-empty": {
    icon: Trash2,
    title: "Trash is empty",
    description: "Deleted items land here so you can restore them.",
  },
};

interface EmptyStateProps {
  variant: EmptyStateVariant;
  /** Search query — renders the no-results title as `No matches for "q"`. */
  query?: string;
  action?: React.ReactNode;
}

export function EmptyState({ variant, query, action }: EmptyStateProps) {
  const { icon: Icon, title, description } = COPY[variant];
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out-strong">
      {/* When wrapped in a .group drop-target button, the tile answers the
          hover — a quiet cue that this whole area is interactive. */}
      <span className="flex size-12 items-center justify-center rounded-full bg-muted transition-colors duration-200 group-hover:bg-folder-bg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-300 motion-safe:ease-out-back">
        <Icon
          className="size-6 text-muted-foreground transition-colors duration-200 group-hover:text-brand"
          strokeWidth={1.75}
        />
      </span>
      <p className="mt-4 text-sm font-medium">
        {variant === "no-results" && query ? (
          <>No matches for &ldquo;{query}&rdquo;</>
        ) : (
          title
        )}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
