import Dexie, { type EntityTable } from "dexie";
import type { Node } from "@/types";

export interface BlobRecord {
  blobKey: string;
  blob: Blob;
}

/**
 * The only file that defines Dexie stores. Blobs live in a separate store so
 * listing children never deserializes PDF bytes. Any index/store change
 * requires a version bump here.
 */
const db = new Dexie("DataRoomDB") as Dexie & {
  nodes: EntityTable<Node, "id">;
  blobs: EntityTable<BlobRecord, "blobKey">;
};

db.version(1).stores({
  nodes: "&id, parentId, [parentId+name]",
  blobs: "&blobKey",
});

export { db };
