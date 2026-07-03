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

export const ROOM_COLORS: Record<
  string,
  { tile: string; swatch: string; wash: string }
> = {
  blue: {
    tile: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    swatch: "bg-blue-500",
    wash: "from-blue-500/8 dark:from-blue-400/10",
  },
  violet: {
    tile: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
    swatch: "bg-violet-500",
    wash: "from-violet-500/8 dark:from-violet-400/10",
  },
  emerald: {
    tile: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    swatch: "bg-emerald-500",
    wash: "from-emerald-500/8 dark:from-emerald-400/10",
  },
  amber: {
    tile: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    swatch: "bg-amber-500",
    wash: "from-amber-500/10 dark:from-amber-400/10",
  },
  rose: {
    tile: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
    swatch: "bg-rose-500",
    wash: "from-rose-500/8 dark:from-rose-400/10",
  },
  cyan: {
    tile: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400",
    swatch: "bg-cyan-500",
    wash: "from-cyan-500/8 dark:from-cyan-400/10",
  },
  orange: {
    tile: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
    swatch: "bg-orange-500",
    wash: "from-orange-500/10 dark:from-orange-400/10",
  },
  slate: {
    tile: "bg-slate-200 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
    swatch: "bg-slate-500",
    wash: "from-slate-500/10 dark:from-slate-400/10",
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
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-200 motion-safe:ease-out-back",
        )}
        strokeWidth={1.75}
      />
    </span>
  );
}
