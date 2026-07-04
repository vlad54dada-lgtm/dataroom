import {
  Archive,
  Banknote,
  Briefcase,
  Building2,
  Folder,
  Globe,
  Landmark,
  Rocket,
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

export const ROOM_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  building: Building2,
  scale: Scale,
  landmark: Landmark,
  banknote: Banknote,
  chart: TrendingUp,
  shield: ShieldCheck,
  users: Users,
  globe: Globe,
  rocket: Rocket,
  archive: Archive,
};

/**
 * Registrar tones: identity lives in the avatar tile alone (the old card
 * wash/band layers are gone). Deep ledger swatches, quiet tile tints —
 * hues stay well-spaced so rooms remain tellable apart at a glance.
 * Tile glyphs clear the 3:1 non-text bar on both themes with margin.
 */
export const ROOM_COLORS: Record<string, { tile: string; swatch: string }> = {
  blue: {
    tile: "bg-blue-100 text-blue-900 dark:bg-blue-400/10 dark:text-blue-300",
    swatch: "bg-blue-900",
  },
  violet: {
    tile: "bg-violet-100 text-violet-800 dark:bg-violet-400/10 dark:text-violet-300",
    swatch: "bg-violet-800",
  },
  emerald: {
    tile: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300",
    swatch: "bg-emerald-800",
  },
  amber: {
    tile: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
    swatch: "bg-amber-700",
  },
  rose: {
    tile: "bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300",
    swatch: "bg-rose-900",
  },
  cyan: {
    tile: "bg-cyan-100 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-300",
    swatch: "bg-cyan-800",
  },
  orange: {
    tile: "bg-orange-100 text-orange-800 dark:bg-orange-400/10 dark:text-orange-300",
    swatch: "bg-orange-800",
  },
  slate: {
    tile: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
    swatch: "bg-slate-600",
  },
};

export const ROOM_ICON_KEYS = Object.keys(ROOM_ICONS);
export const ROOM_COLOR_KEYS = Object.keys(ROOM_COLORS);

const DEFAULT_ICON = "folder";
const DEFAULT_COLOR = "blue";

/** Palette for a stored color key, with the same fallback the avatar uses. */
export function resolveRoomColor(color?: string | null) {
  return ROOM_COLORS[color ?? DEFAULT_COLOR] ?? ROOM_COLORS[DEFAULT_COLOR];
}

interface RoomAvatarProps {
  icon?: string | null;
  color?: string | null;
  /** sm = table/list rows (32px), lg = cards and dialogs (40px). */
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
        "flex shrink-0 items-center justify-center rounded-tile",
        size === "lg" ? "size-10" : "size-8",
        palette.tile,
        animateSwaps && "transition-colors duration-300",
        className,
      )}
    >
      <Icon
        key={animateSwaps ? iconKey : undefined}
        className={cn(
          size === "lg" ? "size-5" : "size-4.5",
          animateSwaps &&
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150 motion-safe:ease-out-strong",
        )}
        strokeWidth={1.75}
      />
    </span>
  );
}
