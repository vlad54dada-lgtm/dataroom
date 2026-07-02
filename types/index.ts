export type NodeType = "dataroom" | "folder" | "file";

/**
 * Single tree node. Invariants:
 * - dataroom ⇒ parentId === null (roots of the tree)
 * - folder   ⇒ parentId !== null
 * - file     ⇒ parentId !== null, size ≥ 0, blobKey defined
 */
export interface Node {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  createdAt: number;
  updatedAt: number;
  size?: number; // files only, bytes
  blobKey?: string; // files only
}

/** Files are created through saveFile(), not createNode(). */
export type CreateNodeInput =
  | { type: "dataroom"; name: string }
  | { type: "folder"; parentId: string; name: string };

/** Descendant counts for a delete confirmation (target itself excluded). */
export interface DeleteCounts {
  folders: number;
  files: number;
}
