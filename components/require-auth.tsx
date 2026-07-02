"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/use-session";
import { AppHeader } from "@/components/app-header";
import { ListSkeleton } from "@/components/list-skeleton";

/**
 * Client-side route guard: renders children only with a live session,
 * redirects to /login otherwise. While the session resolves it shows a
 * page-shaped skeleton (pass `fallback` to match the page's real geometry)
 * so guarded pages never flash blank or jump layouts.
 */
export function RequireAuth({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status !== "signed-out") return;
    // Remember where the user was headed so sign-in can return there —
    // bookmarked deep folders and expired sessions land back in place.
    const here = window.location.pathname + window.location.search;
    router.replace(
      here && here !== "/"
        ? `/login?next=${encodeURIComponent(here)}`
        : "/login",
    );
  }, [session.status, router]);

  if (session.status !== "signed-in") {
    return (
      fallback ?? (
        <>
          <AppHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
            <ListSkeleton variant="rows" count={3} />
          </main>
        </>
      )
    );
  }
  return <>{children}</>;
}
