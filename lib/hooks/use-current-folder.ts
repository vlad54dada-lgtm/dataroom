"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Canonical URL contract for the room view — the URL is the single source of
 * navigational truth:
 *
 * - Root is the ABSENCE of the `folder` param: `/room/<roomId>`.
 *   Never `?folder=<roomId>` — exactly one URL per view, so back/forward
 *   history is deterministic.
 * - A subfolder is `/room/<roomId>?folder=<folderId>`.
 *
 * Must be rendered inside a <Suspense> boundary (useSearchParams requirement
 * in production builds).
 */
export function useCurrentFolder(roomId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderParam = searchParams.get("folder");

  const currentFolderId = folderParam ?? roomId;
  const isRoot = folderParam === null;

  const hrefFor = useCallback(
    (id: string) =>
      id === roomId ? `/room/${roomId}` : `/room/${roomId}?folder=${id}`,
    [roomId],
  );

  const navigateToFolder = useCallback(
    (id: string) => router.push(hrefFor(id)),
    [router, hrefFor],
  );

  /** History-replacing variant — used for redirect-after-delete. */
  const replaceFolder = useCallback(
    (id: string) => router.replace(hrefFor(id)),
    [router, hrefFor],
  );

  return { currentFolderId, isRoot, hrefFor, navigateToFolder, replaceFolder };
}
