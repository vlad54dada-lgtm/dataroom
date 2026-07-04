import {
  Archive,
  Banknote,
  Briefcase,
  Building2,
  Folder,
  Gavel,
  Globe,
  Landmark,
  Scale,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dataroom avatar system: a curated icon set × a soft color palette.
 * Icon/color keys are stored on the node; unknown keys fall back to the
 * default folder-on-blue so old rooms and bad data never break.
 */

// One icon per due-diligence workstream: corporate, legal, litigation,
// regulatory, finance, HR, insurance, cross-border, records. (The old
// "rocket" read startup, not M&A — stored rocket keys fall back to folder.)
export const ROOM_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  building: Building2,
  scale: Scale,
  gavel: Gavel,
  landmark: Landmark,
  banknote: Banknote,
  chart: TrendingUp,
  shield: ShieldCheck,
  users: Users,
  globe: Globe,
  archive: Archive,
};

/**
 * Duotone: glyphs take a quiet self-fill like the folder/file tiles do.
 * Open-polyline glyphs (the chart line, the scale's beams) would fill as
 * solid blobs via SVG's implicit path closing — those stay outline-only.
 */
const OUTLINE_ONLY_ICONS = new Set(["chart", "scale"]);
export const roomIconFill = (key: string) =>
  OUTLINE_ONLY_ICONS.has(key) ? undefined : "fill-current/10";

/**
 * Registrar tones: identity lives in the avatar tile alone. Quiet tile
 * tints with a deep glyph (solid deep fills were tried and rejected —
 * they read heavy and stamp-like at tile size); hues stay well-spaced so
 * rooms remain tellable apart at a glance. Tile glyphs clear the 3:1
 * non-text bar on both themes with margin; swatch dots sit at the 500
 * register in dark (deep fills vanish against the dark popover, 400s
 * read candy; weakest 500 holds the WCAG 1.4.11 3:1 bar).
 */
export const ROOM_COLORS: Record<string, { tile: string; swatch: string }> = {
  blue: {
    tile: "bg-blue-100 text-blue-900 dark:bg-blue-400/10 dark:text-blue-300",
    swatch: "bg-blue-900 dark:bg-blue-500",
  },
  violet: {
    tile: "bg-violet-100 text-violet-800 dark:bg-violet-400/10 dark:text-violet-300",
    swatch: "bg-violet-800 dark:bg-violet-500",
  },
  emerald: {
    tile: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300",
    swatch: "bg-emerald-800 dark:bg-emerald-500",
  },
  amber: {
    tile: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
    swatch: "bg-amber-700 dark:bg-amber-500",
  },
  rose: {
    tile: "bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300",
    swatch: "bg-rose-900 dark:bg-rose-500",
  },
  cyan: {
    tile: "bg-cyan-100 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-300",
    swatch: "bg-cyan-800 dark:bg-cyan-500",
  },
  orange: {
    tile: "bg-orange-100 text-orange-800 dark:bg-orange-400/10 dark:text-orange-300",
    swatch: "bg-orange-800 dark:bg-orange-500",
  },
  slate: {
    tile: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
    swatch: "bg-slate-600 dark:bg-slate-500",
  },
};

export const ROOM_ICON_KEYS = Object.keys(ROOM_ICONS);
export const ROOM_COLOR_KEYS = Object.keys(ROOM_COLORS);

const DEFAULT_ICON = "folder";
const DEFAULT_COLOR = "blue";

/** Palette for a stored color key, with the same fallback the avatar uses. */
function resolveRoomColor(color?: string | null) {
  return ROOM_COLORS[color ?? DEFAULT_COLOR] ?? ROOM_COLORS[DEFAULT_COLOR];
}

interface RoomAvatarProps {
  icon?: string | null;
  color?: string | null;
  /** xs = nav rail (28px), sm = table/list rows (32px), lg = cards (40px). */
  size?: "xs" | "sm" | "lg";
  /**
   * Live-preview mode (the dataroom dialog): tile color tweens and the
   * glyph pops in when the icon prop changes. Off by default so avatars
   * in lists and cards stay perfectly still.
   */
  animateSwaps?: boolean;
  className?: string;
}

export function RoomAvatar({
  icon,
  color,
  size = "lg",
  animateSwaps = false,
  className,
}: RoomAvatarProps) {
  const iconKey = ROOM_ICONS[icon ?? DEFAULT_ICON] ? (icon ?? DEFAULT_ICON) : DEFAULT_ICON;
  const Icon = ROOM_ICONS[iconKey];
  const palette = resolveRoomColor(color);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center ring-1 ring-current/10 ring-inset",
        // xs is the nav register: smaller and squarer than content tiles,
        // so rail rooms never read as table folder rows.
        size === "xs" ? "size-7 rounded-md" : "rounded-tile",
        size === "lg" && "size-10",
        size === "sm" && "size-8",
        palette.tile,
        animateSwaps && "transition-colors duration-300",
        className,
      )}
    >
      <Icon
        key={animateSwaps ? iconKey : undefined}
        className={cn(
          size === "lg" ? "size-5" : size === "sm" ? "size-4.5" : "size-4",
          roomIconFill(iconKey),
          animateSwaps &&
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150 motion-safe:ease-out-strong",
        )}
        strokeWidth={1.75}
      />
    </span>
  );
}
