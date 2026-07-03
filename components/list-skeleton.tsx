import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
  variant: "cards" | "rows";
  count?: number;
}

/** Loading placeholders that match the final geometry — no layout shift. */
export function ListSkeleton({ variant, count = 3 }: ListSkeletonProps) {
  // The shimmer inside each card/row starts slightly later than the one
  // before it, so the sweep travels across the list instead of blinking
  // in unison. Skeleton reads the variable from its container.
  const delay = (i: number) =>
    ({ "--skeleton-delay": `${i * 90}ms` }) as React.CSSProperties;
  if (variant === "cards") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="rounded-card border bg-card p-4" style={delay(i)}>
            <Skeleton className="size-10 rounded-tile" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="divide-y overflow-hidden rounded-card border bg-card">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 px-4" style={delay(i)}>
          <Skeleton className="size-8 rounded-tile" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
