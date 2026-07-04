"use client";

import { AppHeader } from "@/components/app-header";
import { RequireAuth } from "@/components/require-auth";
import { RoomRail } from "@/components/room-rail";

/**
 * Shared shell for every /room/[id] view. It lives OUTSIDE the dynamic
 * segment, so switching rooms swaps only the content column — the header
 * and the dataroom rail persist without remounting (the App Router keys
 * the [id] subtree per param, which used to replay every entrance and
 * made rail navigation feel jerky).
 */
export default function RoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <AppHeader />
      {/* max-w-7xl (not 6xl): the rail borrows ~240px on lg+, so the
          content column keeps its working width. The rail carries its own
          vertical padding; the column keeps the page's. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl flex-1 scroll-mt-14 px-6 outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        <RoomRail />
        <div className="flex min-w-0 flex-1 flex-col py-8">{children}</div>
      </main>
    </RequireAuth>
  );
}
