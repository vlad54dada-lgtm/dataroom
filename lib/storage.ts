import { supabase } from "@/lib/supabase";
import type { CreateNodeInput, DeleteCounts, Node, NodeType } from "@/types";
import {
  MAX_NAME_LENGTH,
  normalizeName,
  splitExtension,
  validateName,
} from "@/lib/utils";

/**
 * Storage adapter — the single seam between the UI and persistence. This
 * file originally spoke to IndexedDB (Dexie); swapping it to Supabase
 * (Postgres + Storage) touched ONLY this module: the exported API and every
 * error contract are unchanged, so no component was modified.
 *
 * Security model: every query runs under the caller's Supabase session; RLS
 * scopes rows to the owner, and duplicate container names are enforced by a
 * case-insensitive unique index (closes the cross-tab race the local
 * version could only best-effort).
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
// Row mapping
// ---------------------------------------------------------------------------

interface NodeRow {
  id: string;
  parent_id: string | null;
  type: NodeType;
  name: string;
  size: number | null;
  blob_path: string | null;
  created_at: string;
  updated_at: string;
}

const NODE_COLUMNS =
  "id, parent_id, type, name, size, blob_path, created_at, updated_at";

function toNode(row: NodeRow): Node {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    ...(row.type === "file"
      ? { size: row.size ?? 0, blobKey: row.blob_path ?? undefined }
      : {}),
  };
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

/** Postgres unique-violation → our typed duplicate error. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
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
  const { data, error } = await supabase
    .from("nodes")
    .select(NODE_COLUMNS)
    .eq("id", id)
    .maybeSingle<NodeRow>();
  if (error) {
    // Malformed ids (?folder=garbage isn't a uuid) read as "not found".
    if (error.code === "22P02") return undefined;
    throw error;
  }
  return data ? toNode(data) : undefined;
}

export async function listChildren(parentId: string | null): Promise<Node[]> {
  let query = supabase.from("nodes").select(NODE_COLUMNS);
  query =
    parentId === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", parentId);
  const { data, error } = await query.overrideTypes<NodeRow[]>();
  if (error) throw error;
  return (data ?? []).map(toNode).sort(compareNodes);
}

/** Direct children only — the "N items" count on dataroom cards. */
export async function countChildren(parentId: string | null): Promise<number> {
  let query = supabase
    .from("nodes")
    .select("id", { count: "exact", head: true });
  query =
    parentId === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", parentId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Name policy (files auto-suffix here; containers rely on the DB's
// case-insensitive unique index and surface DuplicateNameError)
// ---------------------------------------------------------------------------

async function takenFileNames(
  parentId: string,
  excludeId?: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id, name")
    .eq("parent_id", parentId)
    .eq("type", "file");
  if (error) throw error;
  const taken = new Set<string>();
  for (const row of data ?? []) {
    if (row.id === excludeId) continue;
    taken.add(row.name.toLowerCase());
  }
  return taken;
}

/**
 * File duplicates get " (N)" before the extension: report.pdf → report (1).pdf
 * → report (2).pdf. The base is truncated if the suffixed name would exceed
 * 255 chars; a random suffix caps the loop as a last resort.
 */
async function resolveFileName(
  parentId: string,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const taken = await takenFileNames(parentId, excludeId);
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

export async function createNode(input: CreateNodeInput): Promise<Node> {
  const name = normalizeName(input.name);
  const invalid = validateName(name);
  if (invalid) throw new InvalidNameError(invalid);
  const userId = await currentUserId();
  const parentId = input.type === "dataroom" ? null : input.parentId;
  const { data, error } = await supabase
    .from("nodes")
    .insert({ user_id: userId, parent_id: parentId, type: input.type, name })
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateNameError(input.type);
    throw error;
  }
  return toNode(data);
}

/**
 * Renaming to the exact current name is a no-op (returns unchanged, no
 * updatedAt bump). On collision, folders/datarooms throw; files auto-suffix.
 */
export async function renameNode(id: string, newName: string): Promise<Node> {
  const name = normalizeName(newName);
  const invalid = validateName(name);
  if (invalid) throw new InvalidNameError(invalid);
  const node = await getNode(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  if (node.name === name) return node; // EC8: unchanged rename is a no-op
  let finalName = name;
  if (node.type === "file" && node.parentId) {
    finalName = await resolveFileName(node.parentId, name, id);
  }
  const { data, error } = await supabase
    .from("nodes")
    .update({ name: finalName })
    .eq("id", id)
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateNameError(node.type);
    throw error;
  }
  return toNode(data);
}

/**
 * Uploads the blob to Storage, then inserts the node row. If the row insert
 * fails the uploaded object is removed — no orphan blob, no blobless node.
 * `contentText` is the pre-extracted PDF text used for content search.
 */
export async function saveFile(
  parentId: string,
  file: File,
  contentText?: string | null,
): Promise<Node> {
  const userId = await currentUserId();
  const desired = fitFileName(normalizeName(file.name) || "Untitled.pdf");
  const blobPath = `${userId}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("pdfs")
    .upload(blobPath, file, { contentType: "application/pdf" });
  if (uploadError) throw uploadError;

  const name = await resolveFileName(parentId, desired);
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      user_id: userId,
      parent_id: parentId,
      type: "file",
      name,
      size: file.size,
      blob_path: blobPath,
      content_text: contentText ?? null,
    })
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) {
    await supabase.storage.from("pdfs").remove([blobPath]);
    throw error;
  }
  return toNode(data);
}

/** Raw Blob or undefined — object-URL lifecycle belongs to the viewer. */
export async function getBlob(blobKey: string): Promise<Blob | undefined> {
  const { data, error } = await supabase.storage.from("pdfs").download(blobKey);
  if (error) return undefined;
  return data ?? undefined;
}

// ---------------------------------------------------------------------------
// Recursive delete
// ---------------------------------------------------------------------------

/** Descendant counts for the delete confirm (target itself excluded). */
export async function getDeleteCounts(id: string): Promise<DeleteCounts> {
  const { data, error } = await supabase
    .rpc("get_subtree_stats", { node_id: id })
    .single<{ folders: number; files: number }>();
  if (error) throw error;
  return { folders: Number(data.folders), files: Number(data.files) };
}

/**
 * Metadata for the whole subtree is removed by ONE cascading DELETE (all or
 * nothing at the database level). Blob paths are collected first and their
 * storage objects removed after the metadata commit — a failed cleanup can
 * only leave invisible orphan objects, never half-deleted trees.
 */
export async function deleteNodeRecursive(id: string): Promise<void> {
  const { data: paths, error: pathsError } = await supabase.rpc(
    "get_subtree_blob_paths",
    { node_id: id },
  );
  if (pathsError) throw pathsError;

  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) throw error;

  const blobPaths = (paths ?? []) as string[];
  for (let i = 0; i < blobPaths.length; i += 100) {
    await supabase.storage.from("pdfs").remove(blobPaths.slice(i, i + 100));
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  node: Node;
  /** Name of the containing folder/dataroom — "in {parentName}". */
  parentName: string;
  /** True when the match came from document text, not the name. */
  contentMatch: boolean;
}

interface SearchRow extends NodeRow {
  parent_name: string;
  content_match: boolean;
}

/** Name substring OR full-text content match within one dataroom's subtree. */
export async function searchNodes(
  rootId: string,
  query: string,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await supabase.rpc("search_nodes", {
    root_id: rootId,
    query: trimmed,
  });
  if (error) throw error;
  return ((data ?? []) as SearchRow[]).map((row) => ({
    node: toNode(row),
    parentName: row.parent_name,
    contentMatch: row.content_match,
  }));
}
