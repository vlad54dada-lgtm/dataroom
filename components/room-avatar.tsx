import {
  ArchiveGlyph,
  BanknoteGlyph,
  BriefcaseGlyph,
  BuildingGlyph,
  CabinetGlyph,
  ChartGlyph,
  GavelGlyph,
  GlobeGlyph,
  LandmarkGlyph,
  ScaleGlyph,
  ShieldGlyph,
  UsersGlyph,
  type Glyph,
} from "@/components/glyphs";
import { cn } from "@/lib/utils";

/**
 * Dataroom avatar system: a curated glyph set × a soft color palette.
 * Icon/color keys are stored on the node; unknown keys fall back to the
 * default cabinet-on-blue so old rooms and bad data never break.
 */

// One glyph per due-diligence workstream: corporate, legal, litigation,
// regulatory, finance, HR, insurance, cross-border, records. The stored
// "folder" key deliberately renders a registry CABINET, not a folder —
// a room is a container of folders, and the old folder-on-blue default
// was indistinguishable from folder rows in the table.
export const ROOM_ICONS: Record<string, Glyph> = {
  folder: CabinetGlyph,
  briefcase: BriefcaseGlyph,
  building: BuildingGlyph,
  scale: ScaleGlyph,
  gavel: GavelGlyph,
  landmark: LandmarkGlyph,
  banknote: BanknoteGlyph,
  chart: ChartGlyph,
  shield: ShieldGlyph,
  users: UsersGlyph,
  globe: GlobeGlyph,
  archive: ArchiveGlyph,
};

/** Human names for the picker (the stored keys are legacy). */
export const ICON_LABELS: Record<string, string> = {
  folder: "Cabinet",
  briefcase: "Briefcase",
  building: "Building",
  scale: "Scale",
  gavel: "Gavel",
  landmark: "Landmark",
  banknote: "Banknote",
  chart: "Chart",
  shield: "Shield",
  users: "People",
  globe: "Globe",
  archive: "Archive",
};

/**
 * Registrar tones: identity lives in the avatar tile alone. Quiet tile
 * tints with a deep glyph (solid deep fills were tried and rejected —
 * they read heavy and stamp-like at tile size); hues stay well-spaced so
 * rooms remain tellable apart at a glance. Tile glyphs clear the 3:1
 * non-text bar on both themes with margin; swatch dots sit at the 500
 * register in dark (deep fills vanish against the dark popover, 400s
 * read candy; weakest 500 holds the WCAG 1.4.11 3:1 bar). `ink` is the
 * tileless register the nav rail uses: the same deep hue as bare text.
 */
export const ROOM_COLORS: Record<
  string,
  { tile: string; swatch: string; ink: string }
> = {
  blue: {
    tile: "bg-blue-100 text-blue-900 dark:bg-blue-400/10 dark:text-blue-300",
    swatch: "bg-blue-900 dark:bg-blue-500",
    ink: "text-blue-900 dark:text-blue-300",
  },
  violet: {
    tile: "bg-violet-100 text-violet-800 dark:bg-violet-400/10 dark:text-violet-300",
    swatch: "bg-violet-800 dark:bg-violet-500",
    ink: "text-violet-800 dark:text-violet-300",
  },
  emerald: {
    tile: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300",
    swatch: "bg-emerald-800 dark:bg-emerald-500",
    ink: "text-emerald-800 dark:text-emerald-300",
  },
  amber: {
    tile: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
    swatch: "bg-amber-700 dark:bg-amber-500",
    ink: "text-amber-800 dark:text-amber-300",
  },
  rose: {
    tile: "bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300",
    swatch: "bg-rose-900 dark:bg-rose-500",
    ink: "text-rose-800 dark:text-rose-300",
  },
  cyan: {
    tile: "bg-cyan-100 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-300",
    swatch: "bg-cyan-800 dark:bg-cyan-500",
    ink: "text-cyan-800 dark:text-cyan-300",
  },
  orange: {
    tile: "bg-orange-100 text-orange-800 dark:bg-orange-400/10 dark:text-orange-300",
    swatch: "bg-orange-800 dark:bg-orange-500",
    ink: "text-orange-800 dark:text-orange-300",
  },
  slate: {
    tile: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
    swatch: "bg-slate-600 dark:bg-slate-500",
    ink: "text-slate-700 dark:text-slate-300",
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

/** Deep-hue text classes for a stored color key (the rail's register). */
export function roomInk(color?: string | null) {
  return resolveRoomColor(color).ink;
}

/** Resolved glyph for a stored icon key, with the avatar's fallback. */
export function RoomGlyph({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  const key = ROOM_ICONS[icon ?? DEFAULT_ICON] ? (icon ?? DEFAULT_ICON) : DEFAULT_ICON;
  const Icon = ROOM_ICONS[key];
  return <Icon className={className} />;
}

interface RoomAvatarProps {
  icon?: string | null;
  color?: string | null;
  /** sm = table/list rows (32px), lg = cards (40px). */
  size?: "sm" | "lg";
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
        "flex shrink-0 items-center justify-center rounded-tile ring-1 ring-current/10 ring-inset",
        size === "lg" ? "size-10" : "size-8",
        palette.tile,
        animateSwaps && "transition-colors duration-300",
        className,
      )}
    >
      <Icon
        key={animateSwaps ? iconKey : undefined}
        className={cn(
          // Both sizes ship at proven renders (20px); 18px sub-pixels the
          // 1.5 stroke and goes soft on 1x displays.
          "size-5",
          animateSwaps &&
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150 motion-safe:ease-out-strong",
        )}
      />
    </span>
  );
}
