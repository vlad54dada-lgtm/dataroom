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
  description?: string; // datarooms only
  icon?: string; // datarooms only — room avatar icon key
  color?: string; // datarooms only — room avatar palette key
}

/** Files are created through saveFile(), not createNode(). */
export type CreateNodeInput =
  | {
      type: "dataroom";
      name: string;
      description?: string | null;
      icon?: string | null;
      color?: string | null;
    }
  | { type: "folder"; parentId: string; name: string };

/** Editable dataroom identity (the room dialog's payload). */
export interface DataroomPatch {
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

/** Descendant counts for a delete confirmation (target itself excluded). */
export interface DeleteCounts {
  folders: number;
  files: number;
}
