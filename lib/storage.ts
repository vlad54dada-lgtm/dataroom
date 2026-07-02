import { db } from "@/lib/db";
import type { CreateNodeInput, DeleteCounts, Node, NodeType } from "@/types";
import {
  MAX_NAME_LENGTH,
  normalizeName,
  splitExtension,
  validateName,
} from "@/lib/utils";

/**
 * Storage adapter — the single seam between the UI and persistence. Every
 * method is async and throws typed errors, mimicking a real backend, so
 * swapping Dexie for an API later means rewriting only this file (and db.ts).
 * Components never import Dexie directly.
 */

// ---------------------------------------------------------------------------
// Typed errors (class + guard: `instanceof` can fail across HMR bundles)
// ---------------------------------------------------------------------------

export class DuplicateNameError extends Error {
  readonly code = "DUPLICATE_NAME";
  constructor(readonly nodeType: NodeType) {
    super(
      nodeType === "dataroom"
        ? "A dataroom with this name already exists"
        : "A folder with this name already exists",
    );
    this.name = "DuplicateNameError";
  }
}

export function isDuplicateNameError(
  error: unknown,
): error is DuplicateNameError {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "DUPLICATE_NAME"
  );
}

export class InvalidNameError extends Error {
  readonly code = "INVALID_NAME";
  constructor(message: string) {
    super(message);
    this.name = "InvalidNameError";
  }
}

// ---------------------------------------------------------------------------
// Sort contract: folders (and datarooms) before files, then name-asc with
// numeric ordering. Exported so optimistic UI inserts reuse the exact order.
// ---------------------------------------------------------------------------

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function compareNodes(a: Node, b: Node): number {
  const rankA = a.type === "file" ? 1 : 0;
  const rankB = b.type === "file" ? 1 : 0;
  if (rankA !== rankB) return rankA - rankB;
  return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Returns undefined for a missing id — never throws (feeds not-found UI). */
export async function getNode(id: string): Promise<Node | undefined> {
  return db.nodes.get(id);
}

/** `null` lists datarooms (IndexedDB can't index null, so that path filters). */
export async function listChildren(parentId: string | null): Promise<Node[]> {
  const children =
    parentId === null
      ? await db.nodes.filter((n) => n.parentId === null).toArray()
      : await db.nodes.where("parentId").equals(parentId).toArray();
  return children.sort(compareNodes);
}

/** Direct children only — the "N items" count on dataroom cards. */
export async function countChildren(parentId: string | null): Promise<number> {
  return parentId === null
    ? db.nodes.filter((n) => n.parentId === null).count()
    : db.nodes.where("parentId").equals(parentId).count();
}

// ---------------------------------------------------------------------------
// Name policy (lives here, not in components)
// ---------------------------------------------------------------------------

/** Lowercased names of same-type siblings, optionally excluding one node. */
async function takenNames(
  parentId: string | null,
  type: NodeType,
  excludeId?: string,
): Promise<Set<string>> {
  const siblings =
    parentId === null
      ? await db.nodes.filter((n) => n.parentId === null).toArray()
      : await db.nodes.where("parentId").equals(parentId).toArray();
  const taken = new Set<string>();
  for (const sibling of siblings) {
    if (sibling.type !== type) continue; // a folder "X" and file "X" may coexist
    if (sibling.id === excludeId) continue;
    taken.add(sibling.name.toLowerCase());
  }
  return taken;
}

/**
 * File duplicates get " (N)" before the extension: report.pdf → report (1).pdf
 * → report (2).pdf. An existing "report (1).pdf" is treated literally, so a
 * new "report (1).pdf" becomes "report (1) (1).pdf" (Drive behavior). The base
 * is truncated if the suffixed name would exceed 255 chars; a random suffix
 * caps the loop as a last resort.
 */
async function resolveFileName(
  parentId: string | null,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const taken = await takenNames(parentId, "file", excludeId);
  if (!taken.has(desired.toLowerCase())) return desired;
  const { base, ext } = splitExtension(desired);
  for (let n = 1; n <= 999; n++) {
    let candidate = `${base} (${n})${ext}`;
    if (candidate.length > MAX_NAME_LENGTH) {
      const overflow = candidate.length - MAX_NAME_LENGTH;
      candidate = `${base.slice(0, base.length - overflow)} (${n})${ext}`;
    }
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, MAX_NAME_LENGTH - ext.length - 9)} (${crypto
    .randomUUID()
    .slice(0, 8)})${ext}`;
}

/** Uploads never reject on length — over-long file names truncate the base. */
function fitFileName(name: string): string {
  if (name.length <= MAX_NAME_LENGTH) return name;
  const { base, ext } = splitExtension(name);
  return base.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Creates a dataroom or folder. The duplicate check runs inside the same rw
 * transaction as the insert, closing the same-tab double-submit race. The
 * null-parent (dataroom) path is filter-based — IndexedDB can't lock an
 * unindexed predicate — so cross-tab dataroom dedupe is best-effort by design.
 */
export async function createNode(input: CreateNodeInput): Promise<Node> {
  const name = normalizeName(input.name);
  const invalid = validateName(name);
  if (invalid) throw new InvalidNameError(invalid);
  const parentId = input.type === "dataroom" ? null : input.parentId;
  return db.transaction("rw", db.nodes, async () => {
    const taken = await takenNames(parentId, input.type);
    if (taken.has(name.toLowerCase())) {
      throw new DuplicateNameError(input.type);
    }
    const now = Date.now();
    const node: Node = {
      id: crypto.randomUUID(),
      parentId,
      type: input.type,
      name,
      createdAt: now,
      updatedAt: now,
    };
    await db.nodes.add(node);
    return node;
  });
}

/**
 * Renaming to the exact current name is a no-op (returns unchanged, no
 * updatedAt bump). On collision, folders/datarooms throw; files auto-suffix.
 */
export async function renameNode(id: string, newName: string): Promise<Node> {
  const name = normalizeName(newName);
  const invalid = validateName(name);
  if (invalid) throw new InvalidNameError(invalid);
  return db.transaction("rw", db.nodes, async () => {
    const node = await db.nodes.get(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    if (node.name === name) return node; // EC8: unchanged rename is a no-op
    let finalName = name;
    if (node.type === "file") {
      finalName = await resolveFileName(node.parentId, name, id);
    } else {
      const taken = await takenNames(node.parentId, node.type, id);
      if (taken.has(name.toLowerCase())) {
        throw new DuplicateNameError(node.type);
      }
    }
    const updated: Node = { ...node, name: finalName, updatedAt: Date.now() };
    await db.nodes.put(updated);
    return updated;
  });
}

/**
 * Stores the blob and its node in ONE transaction over both stores — either
 * both land or neither (no orphan blob, no blobless node). Callers process
 * batches sequentially so suffixing stays deterministic.
 */
export async function saveFile(parentId: string, file: File): Promise<Node> {
  const desired = fitFileName(normalizeName(file.name) || "Untitled.pdf");
  return db.transaction("rw", [db.nodes, db.blobs], async () => {
    const name = await resolveFileName(parentId, desired);
    const now = Date.now();
    const blobKey = crypto.randomUUID();
    await db.blobs.add({ blobKey, blob: file });
    const node: Node = {
      id: crypto.randomUUID(),
      parentId,
      type: "file",
      name,
      createdAt: now,
      updatedAt: now,
      size: file.size,
      blobKey,
    };
    await db.nodes.add(node);
    return node;
  });
}

/** Raw Blob or undefined — object-URL lifecycle belongs to the viewer. */
export async function getBlob(blobKey: string): Promise<Blob | undefined> {
  const record = await db.blobs.get(blobKey);
  return record?.blob;
}

// ---------------------------------------------------------------------------
// Recursive delete
// ---------------------------------------------------------------------------

/** Level-by-level BFS over the parentId index. Runs inside a transaction. */
async function collectSubtree(rootId: string): Promise<{
  nodeIds: string[];
  blobKeys: string[];
  counts: DeleteCounts;
}> {
  const nodeIds: string[] = [rootId];
  const blobKeys: string[] = [];
  const counts: DeleteCounts = { folders: 0, files: 0 };
  const root = await db.nodes.get(rootId);
  if (root?.blobKey) blobKeys.push(root.blobKey);
  let level: string[] = [rootId];
  while (level.length > 0) {
    const children = await db.nodes.where("parentId").anyOf(level).toArray();
    level = [];
    for (const child of children) {
      nodeIds.push(child.id);
      if (child.type === "file") {
        counts.files++;
        if (child.blobKey) blobKeys.push(child.blobKey);
      } else {
        counts.folders++;
        level.push(child.id);
      }
    }
  }
  return { nodeIds, blobKeys, counts };
}

/** Descendant counts for the delete confirm (target itself excluded). */
export async function getDeleteCounts(id: string): Promise<DeleteCounts> {
  return db.transaction("r", db.nodes, async () => {
    const { counts } = await collectSubtree(id);
    return counts;
  });
}

/**
 * Deletes the node, every descendant, and all their blobs in ONE transaction
 * over both stores — all or nothing, never a half-deleted subtree.
 */
export async function deleteNodeRecursive(id: string): Promise<void> {
  await db.transaction("rw", [db.nodes, db.blobs], async () => {
    const { nodeIds, blobKeys } = await collectSubtree(id);
    await db.nodes.bulkDelete(nodeIds);
    await db.blobs.bulkDelete(blobKeys);
  });
}
