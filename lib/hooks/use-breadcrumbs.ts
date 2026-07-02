"use client";

import type { Node } from "@/types";
import { getNode } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";

/**
 * Walks parentId links from the current folder up to the room root and
 * returns the chain in display order (room first). Doubles as the ancestry
 * guard: a missing node, a file id, or a folder belonging to another room
 * all resolve to `notFound` instead of a chain.
 */
export function useBreadcrumbs(roomId: string, folderId: string) {
  const { state, reload } = useAsync<Node[] | null>(async () => {
    const chain: Node[] = [];
    let cursor: string | null = folderId;
    while (cursor !== null) {
      const node = await getNode(cursor);
      if (!node || node.type === "file") return null;
      chain.unshift(node);
      if (node.id === roomId) {
        return node.type === "dataroom" ? chain : null;
      }
      cursor = node.parentId;
    }
    return null; // reached a different root — folder belongs to another room
  }, `${roomId}:${folderId}`);

  return {
    loading: state.status === "loading",
    crumbs: state.status === "success" ? state.data : null,
    notFound: state.status === "success" && state.data === null,
    error: state.status === "error",
    reload,
  };
}
