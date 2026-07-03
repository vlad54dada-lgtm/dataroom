import { cn } from "@/lib/utils"

/**
 * Shimmer sweep instead of the stock pulse. The band reads the inherited
 * `--skeleton-delay` so containers can cascade the sweep across rows;
 * reduced motion falls back to the quiet opacity pulse.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:-translate-x-full motion-safe:after:animate-shimmer motion-safe:after:bg-gradient-to-r motion-safe:after:from-transparent motion-safe:after:via-foreground/6 motion-safe:after:to-transparent motion-safe:after:[animation-delay:var(--skeleton-delay,0s)]",
        "motion-reduce:animate-pulse",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
