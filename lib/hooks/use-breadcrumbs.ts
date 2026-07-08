"use client";

import type { Node } from "@/types";
import { getNode } from "@/lib/storage";
import { useAsync } from "@/lib/hooks/use-async";

/**
 * Walks parentId links from the current folder up to the room root and
 * returns the chain in display order (top-most first). Doubles as the ancestry
 * guard: a missing node, a file id, or a folder belonging to another room
 * resolve to `notFound`.
 *
 * Floor-aware for per-node grantees: a grantee can SELECT nodes only from their
 * granted subtree, so `getNode(parentAboveTheGrant)` returns undefined. When
 * that happens AFTER collecting at least one visible node, we stop and return
 * the collected subtree — its top is the grant "floor", and breadcrumbs never
 * climb above it. Members/owners still reach `roomId` and stop there unchanged.
 */
export function useBreadcrumbs(roomId: string, folderId: string) {
  const { state, reload } = useAsync<Node[] | null>(async () => {
    const chain: Node[] = [];
    let cursor: string | null = folderId;
    while (cursor !== null) {
      const node = await getNode(cursor);
      // An invisible parent = the grant floor (or genuinely gone if we've
      // collected nothing yet → not found).
      if (!node) return chain.length > 0 ? chain : null;
      if (node.type === "file") return null;
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
