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
 * Registrar tones: identity lives in the avatar tile alone. Tiles are
 * SOLID deep fills with a white glyph (the Linear/Notion project-icon
 * register — pastel tints read juvenile at tile size); the same fill
 * serves both themes, edge defined by the white/10 inset ring. Every
 * white-on-fill pair holds >=4.5:1. Swatch dots stay one step brighter
 * in dark (deep fills vanish against the dark popover).
 */
export const ROOM_COLORS: Record<string, { tile: string; swatch: string }> = {
  blue: {
    tile: "bg-blue-900 text-white",
    swatch: "bg-blue-900 dark:bg-blue-500",
  },
  violet: {
    tile: "bg-violet-800 text-white",
    swatch: "bg-violet-800 dark:bg-violet-500",
  },
  emerald: {
    tile: "bg-emerald-800 text-white",
    swatch: "bg-emerald-800 dark:bg-emerald-500",
  },
  amber: {
    tile: "bg-amber-700 text-white",
    swatch: "bg-amber-700 dark:bg-amber-500",
  },
  rose: {
    tile: "bg-rose-900 text-white",
    swatch: "bg-rose-900 dark:bg-rose-500",
  },
  cyan: {
    tile: "bg-cyan-800 text-white",
    swatch: "bg-cyan-800 dark:bg-cyan-500",
  },
  orange: {
    tile: "bg-orange-800 text-white",
    swatch: "bg-orange-800 dark:bg-orange-500",
  },
  slate: {
    tile: "bg-slate-600 text-white",
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
