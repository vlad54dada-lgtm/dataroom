import { supabase } from "@/lib/supabase";
import type {
  CreateNodeInput,
  DataroomPatch,
  DeleteCounts,
  Node,
  NodeType,
} from "@/types";
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
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
  /** Present on table reads (NODE_COLUMNS); RPC row shapes may omit it. */
  user_id?: string;
}

const NODE_COLUMNS =
  "id, parent_id, type, name, size, blob_path, created_at, updated_at, description, icon, color, sort_order, user_id";

function toNode(row: NodeRow): Node {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    ...(row.user_id !== undefined ? { ownerId: row.user_id } : {}),
    ...(row.type === "file"
      ? { size: row.size ?? 0, blobKey: row.blob_path ?? undefined }
      : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.icon !== null ? { icon: row.icon } : {}),
    ...(row.color !== null ? { color: row.color } : {}),
    ...(row.sort_order !== null ? { sortOrder: row.sort_order } : {}),
  };
}

/** Lets open pages (e.g. the trash badge) refresh after trash mutations. */
function emitTrashChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trash-changed"));
  }
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
// Sort contract: folders (and datarooms) before files, then a custom
// drag-to-reorder position (datarooms only) if set, then name-asc with
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
  // Reordered rooms carry a position; unpositioned ones (never dragged, or
  // freshly created) sort after them, then by name.
  const oa = a.sortOrder;
  const ob = b.sortOrder;
  if (oa !== undefined || ob !== undefined) {
    if (oa === undefined) return 1;
    if (ob === undefined) return -1;
    if (oa !== ob) return oa - ob;
  }
  return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
}

/** Persists the drag-reordered order of datarooms (1-based positions). */
export async function reorderDatarooms(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const { error } = await supabase.rpc("reorder_nodes", { ids: orderedIds });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Returns undefined for a missing OR trashed id — never throws (feeds the
 * not-found UI; a trashed folder's URL reads as gone until restored).
 */
export async function getNode(id: string): Promise<Node | undefined> {
  const { data, error } = await supabase
    .from("nodes")
    .select(NODE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<NodeRow>();
  if (error) {
    // Malformed ids (?folder=garbage isn't a uuid) read as "not found".
    if (error.code === "22P02") return undefined;
    throw error;
  }
  return data ? toNode(data) : undefined;
}

export async function listChildren(parentId: string | null): Promise<Node[]> {
  let query = supabase
    .from("nodes")
    .select(NODE_COLUMNS)
    .is("deleted_at", null);
  query =
    parentId === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", parentId);
  const { data, error } = await query.overrideTypes<NodeRow[]>();
  if (error) throw error;
  return (data ?? []).map(toNode).sort(compareNodes);
}

/** Direct live children only — the "N items" count on dataroom cards. */
export async function countChildren(parentId: string | null): Promise<number> {
  let query = supabase
    .from("nodes")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  query =
    parentId === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", parentId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Direct live child counts for MANY parents in one query — the home grid
 * needs a count per room, and N HEAD requests gate its first paint.
 */
export async function listChildCounts(
  parentIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (parentIds.length === 0) return counts;
  // Seed zeros: an EMPTY parent returns no rows but must still read 0.
  for (const id of parentIds) counts.set(id, 0);
  const { data, error } = await supabase
    .from("nodes")
    .select("parent_id")
    .in("parent_id", parentIds)
    .is("deleted_at", null);
  if (error) throw error;
  for (const row of (data ?? []) as { parent_id: string }[]) {
    counts.set(row.parent_id, (counts.get(row.parent_id) ?? 0) + 1);
  }
  return counts;
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
    .eq("type", "file")
    .is("deleted_at", null);
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
  const identity =
    input.type === "dataroom"
      ? {
          description: input.description?.trim() || null,
          icon: input.icon ?? null,
          color: input.color ?? null,
        }
      : {};
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      user_id: userId,
      parent_id: parentId,
      type: input.type,
      name,
      ...identity,
    })
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateNameError(input.type);
    throw error;
  }
  return toNode(data);
}

/** Updates a dataroom's name + identity in one call (the room dialog). */
export async function updateDataroom(
  id: string,
  patch: DataroomPatch,
): Promise<Node> {
  const name = normalizeName(patch.name);
  const invalid = validateName(name);
  if (invalid) throw new InvalidNameError(invalid);
  const { data, error } = await supabase
    .from("nodes")
    .update({
      name,
      description: patch.description?.trim() || null,
      icon: patch.icon,
      color: patch.color,
    })
    .eq("id", id)
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateNameError("dataroom");
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
    })
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) {
    await supabase.storage.from("pdfs").remove([blobPath]);
    throw error;
  }
  // Searchable text lives in its own table; a failed insert must never fail
  // the upload (the file just won't be content-searchable).
  if (contentText) {
    await supabase
      .from("file_texts")
      .insert({ node_id: data.id, user_id: userId, content: contentText })
      .then(() => undefined);
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
// Public links — files AND folders. A node carries at most one active link;
// the unguessable token IS the capability, always view-only. The room owner
// mints/reads/revokes it here; anyone holding the link resolves it through
// the getShared* functions, which need no session (SECURITY DEFINER RPCs +
// an ancestor-aware anon storage-read policy — see migration 14).
// ---------------------------------------------------------------------------

export interface ShareInfo {
  token: string;
  createdAt: number;
  openCount: number;
  lastOpenedAt: number | null;
}

interface ShareRow {
  token: string;
  created_at: string;
  open_count: number;
  last_opened_at: string | null;
}

const SHARE_COLUMNS = "token, created_at, open_count, last_opened_at";

function toShareInfo(row: ShareRow): ShareInfo {
  return {
    token: row.token,
    createdAt: Date.parse(row.created_at),
    openCount: row.open_count,
    lastOpenedAt: row.last_opened_at ? Date.parse(row.last_opened_at) : null,
  };
}

/** The active public link for a node, or null when it isn't shared. */
export async function getShare(nodeId: string): Promise<ShareInfo | null> {
  const { data, error } = await supabase
    .from("file_shares")
    .select(SHARE_COLUMNS)
    .eq("node_id", nodeId)
    .maybeSingle<ShareRow>();
  if (error) throw error;
  return data ? toShareInfo(data) : null;
}

/**
 * Turns sharing ON: returns the existing link if the node already has one,
 * otherwise mints a fresh token. Idempotent — the unique(node_id) index folds
 * a concurrent-create race back to the single row.
 */
export async function createShare(nodeId: string): Promise<ShareInfo> {
  const existing = await getShare(nodeId);
  if (existing) return existing;
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("file_shares")
    .insert({ node_id: nodeId, user_id: userId })
    .select(SHARE_COLUMNS)
    .single<ShareRow>();
  if (error) {
    // Lost the race to a concurrent create — the row exists now, return it.
    if (isUniqueViolation(error)) {
      const now = await getShare(nodeId);
      if (now) return now;
    }
    throw error;
  }
  return toShareInfo(data);
}

/** Turns sharing OFF: deletes the row so the old link stops resolving. */
export async function revokeShare(nodeId: string): Promise<void> {
  const { error } = await supabase
    .from("file_shares")
    .delete()
    .eq("node_id", nodeId);
  if (error) throw error;
}

/**
 * Which of these nodes carry an active public link — one batch query per
 * listing, powering the "shared" badges. Only the caller's own links are
 * visible (RLS), which is exactly who the badges are for.
 */
export async function listShareStatus(
  nodeIds: string[],
): Promise<Set<string>> {
  if (nodeIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("file_shares")
    .select("node_id")
    .in("node_id", nodeIds);
  if (error) throw error;
  return new Set(((data ?? []) as { node_id: string }[]).map((r) => r.node_id));
}

export interface SharedNode {
  nodeId: string;
  type: "file" | "folder";
  name: string;
  size: number | null;
  blobPath: string | null;
}

interface SharedNodeRow {
  node_id: string;
  node_type: "file" | "folder";
  name: string;
  size: number | null;
  blob_path: string | null;
}

/**
 * Resolves a share token to its node (file or folder) — works WITHOUT a
 * session. Returns null for an unknown, expired, or trashed link. File blobs
 * are fetched with getBlob(blobPath) under the anon storage policy.
 */
export async function getSharedNode(token: string): Promise<SharedNode | null> {
  const { data, error } = await supabase.rpc("get_shared_node", {
    share_token: token,
  });
  if (error) {
    // A malformed token isn't a uuid — read as "no such share".
    if (error.code === "22P02") return null;
    throw error;
  }
  const row = ((data ?? []) as SharedNodeRow[])[0];
  return row
    ? {
        nodeId: row.node_id,
        type: row.node_type,
        name: row.name,
        size: row.size,
        blobPath: row.blob_path,
      }
    : null;
}

export interface SharedChild {
  id: string;
  parentId: string;
  type: "file" | "folder";
  name: string;
  size: number | null;
  blobPath: string | null;
  createdAt: number;
  updatedAt: number;
}

interface SharedChildRow {
  id: string;
  parent_id: string;
  type: "file" | "folder";
  name: string;
  size: number | null;
  blob_path: string | null;
  created_at: string;
  updated_at: string;
}

const sharedChildCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Children of a folder inside a shared subtree (anon). The RPC verifies the
 * requested parent actually lives under the token's folder — ids outside the
 * share read as an empty folder, which the page treats as "not available".
 */
export async function listSharedChildren(
  token: string,
  parentId: string,
): Promise<SharedChild[]> {
  const { data, error } = await supabase.rpc("list_shared_children", {
    share_token: token,
    parent: parentId,
  });
  if (error) {
    if (error.code === "22P02") return [];
    throw error;
  }
  return ((data ?? []) as SharedChildRow[])
    .map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      type: row.type,
      name: row.name,
      size: row.size,
      blobPath: row.blob_path,
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at),
    }))
    .sort(
      (a, b) =>
        Number(a.type === "file") - Number(b.type === "file") ||
        sharedChildCollator.compare(a.name, b.name) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Breadcrumb chain from the shared root down to nodeId (anon) — how a deep
 * ?folder= URL rebuilds its trail on refresh. Empty when nodeId is outside
 * the shared subtree.
 */
export async function getSharedAncestors(
  token: string,
  nodeId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc("get_shared_ancestors", {
    share_token: token,
    node: nodeId,
  });
  if (error) {
    if (error.code === "22P02") return [];
    throw error;
  }
  return ((data ?? []) as { id: string; name: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
  }));
}

// Once per token per session — a reload is a new open, a re-render isn't.
const recordedOpens = new Set<string>();

/** Bumps the link's open counter (anon-callable, best-effort). */
export async function recordShareOpen(token: string): Promise<void> {
  if (recordedOpens.has(token)) return;
  recordedOpens.add(token);
  await supabase
    .rpc("record_share_open", { share_token: token })
    .then(() => undefined, () => undefined);
}

// ---------------------------------------------------------------------------
// Dataroom membership — invites by email with viewer/editor roles. Only the
// room owner manages access; RLS enforces every rule the UI expresses.
// ---------------------------------------------------------------------------

export type RoomRole = "owner" | "editor" | "viewer";

export class DuplicateInviteError extends Error {
  readonly code = "DUPLICATE_INVITE";
  constructor() {
    super("This person is already invited");
    this.name = "DuplicateInviteError";
  }
}

export function isDuplicateInviteError(
  error: unknown,
): error is DuplicateInviteError {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "DUPLICATE_INVITE"
  );
}

// Pending invites are claimed by email on first load after sign-in. Single
// flight per user: every listRooms/getMyRoomAccess awaits the same promise,
// so a burst of loaders costs one RPC.
let claimedForUid: string | null = null;
let claimPromise: Promise<void> | null = null;

async function claimInvitesOnce(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (!uid) return;
  if (claimedForUid === uid && claimPromise) return claimPromise;
  claimedForUid = uid;
  // Best-effort; the signup trigger already ran for brand-new accounts.
  claimPromise = Promise.resolve(
    supabase.rpc("claim_room_invites").then(() => undefined, () => undefined),
  );
  return claimPromise;
}

/** The caller's relationship to a room; null = no access (or no session). */
export async function getMyRoomAccess(
  roomId: string,
): Promise<RoomRole | null> {
  await claimInvitesOnce();
  const { data, error } = await supabase.rpc("room_access", { room: roomId });
  if (error) {
    if (error.code === "22P02") return null;
    throw error;
  }
  return (data ?? null) as RoomRole | null;
}

export interface RoomListEntry {
  node: Node;
  access: RoomRole;
  /** Members invited by the owner; 0 unless access = "owner". */
  memberCount: number;
}

interface RoomListRow extends NodeRow {
  access: RoomRole | null;
  member_count: number;
}

/**
 * Every dataroom the caller can open — owned AND shared with them — with
 * their role and (for owners) the member count. Replaces listChildren(null)
 * everywhere a room list is shown.
 */
export async function listRooms(): Promise<RoomListEntry[]> {
  await claimInvitesOnce();
  const { data, error } = await supabase.rpc("list_rooms");
  if (error) throw error;
  return ((data ?? []) as RoomListRow[])
    .filter((row) => row.access !== null)
    .map((row) => ({
      node: toNode(row),
      access: row.access as RoomRole,
      memberCount: Number(row.member_count),
    }))
    .sort((a, b) => compareNodes(a.node, b.node));
}

export interface RoomMember {
  id: string;
  email: string;
  role: Exclude<RoomRole, "owner">;
  /** True until the invitee signs up/in with the invited email. */
  pending: boolean;
  createdAt: number;
}

interface RoomMemberRow {
  id: string;
  email: string;
  role: "viewer" | "editor";
  user_id: string | null;
  created_at: string;
}

/** Members of one room (owner-only by RLS), oldest first. */
export async function listRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from("room_members")
    .select("id, email, role, user_id, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RoomMemberRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    pending: row.user_id === null,
    createdAt: Date.parse(row.created_at),
  }));
}

/**
 * Invites an email to the room. Throws InvalidNameError for a malformed or
 * own address (rendered inline by the dialog) and DuplicateInviteError when
 * the email is already on the list.
 */
export async function inviteMember(
  roomId: string,
  email: string,
  role: "viewer" | "editor",
): Promise<RoomMember> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new InvalidNameError("Enter a valid email address");
  }
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user;
  if (!me) throw new Error("Not signed in");
  if (me.email && me.email.toLowerCase() === normalized) {
    throw new InvalidNameError("That's your own email");
  }
  // A DB trigger links user_id when the email already has an account, so
  // the returned row is immediately "active" rather than pending.
  const { data, error } = await supabase
    .from("room_members")
    .insert({
      room_id: roomId,
      email: normalized,
      role,
      invited_by: me.id,
    })
    .select("id, email, role, user_id, created_at")
    .single<RoomMemberRow>();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateInviteError();
    throw error;
  }
  return {
    id: data.id,
    email: data.email,
    role: data.role,
    pending: data.user_id === null,
    createdAt: Date.parse(data.created_at),
  };
}

/** Switches a member between viewer and editor (owner-only by RLS). */
export async function setMemberRole(
  memberId: string,
  role: "viewer" | "editor",
): Promise<void> {
  const { error } = await supabase
    .from("room_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw error;
}

/** Removes a member — their access ends at the database, immediately. */
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}

/** The member's own exit: deletes their membership row for this room. */
export async function leaveRoom(roomId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sharing & access panel queries
// ---------------------------------------------------------------------------

export interface MyShareLink {
  token: string;
  createdAt: number;
  openCount: number;
  lastOpenedAt: number | null;
  nodeId: string;
  nodeName: string;
  nodeType: NodeType;
  /** False when the shared node is in the trash (link resolves as gone). */
  active: boolean;
  /** Containing room's name; null when the node IS a room-level item. */
  roomName: string | null;
}

interface MyShareRow {
  token: string;
  created_at: string;
  open_count: number;
  last_opened_at: string | null;
  node_id: string;
  node_name: string;
  node_type: NodeType;
  active: boolean;
  room_name: string | null;
}

/** Every public link the caller has minted, newest first, with open stats. */
export async function listMyShares(): Promise<MyShareLink[]> {
  const { data, error } = await supabase.rpc("list_my_shares");
  if (error) throw error;
  return ((data ?? []) as MyShareRow[]).map((row) => ({
    token: row.token,
    createdAt: Date.parse(row.created_at),
    openCount: row.open_count,
    lastOpenedAt: row.last_opened_at ? Date.parse(row.last_opened_at) : null,
    nodeId: row.node_id,
    nodeName: row.node_name,
    nodeType: row.node_type,
    active: row.active,
    roomName: row.room_name,
  }));
}

export interface RoomMembersGroup {
  roomId: string;
  roomName: string;
  roomIcon: string | null;
  roomColor: string | null;
  members: RoomMember[];
}

interface MyRoomMemberRow {
  id: string;
  room_id: string;
  room_name: string;
  room_icon: string | null;
  room_color: string | null;
  email: string;
  role: "viewer" | "editor";
  claimed: boolean;
  created_at: string;
}

/** Members across every room the caller owns, grouped per room. */
export async function listMyRoomMembers(): Promise<RoomMembersGroup[]> {
  const { data, error } = await supabase.rpc("list_my_room_members");
  if (error) throw error;
  const groups = new Map<string, RoomMembersGroup>();
  for (const row of (data ?? []) as MyRoomMemberRow[]) {
    let group = groups.get(row.room_id);
    if (!group) {
      group = {
        roomId: row.room_id,
        roomName: row.room_name,
        roomIcon: row.room_icon,
        roomColor: row.room_color,
        members: [],
      };
      groups.set(row.room_id, group);
    }
    group.members.push({
      id: row.id,
      email: row.email,
      role: row.role,
      pending: !row.claimed,
      createdAt: Date.parse(row.created_at),
    });
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// File versions. The nodes row always mirrors the CURRENT version; the
// file_versions table is the linear history. Files uploaded before this
// feature have no rows — their history materializes lazily on the first
// "Upload new version".
// ---------------------------------------------------------------------------

export interface FileVersion {
  id: string;
  version: number;
  size: number;
  createdAt: number;
  blobKey: string;
  isCurrent: boolean;
}

interface FileVersionRow {
  id: string;
  version: number;
  size: number;
  blob_path: string;
  created_at: string;
}

/** History for a file, newest first. Unversioned files report one entry. */
export async function listFileVersions(node: Node): Promise<FileVersion[]> {
  const { data, error } = await supabase
    .from("file_versions")
    .select("id, version, size, blob_path, created_at")
    .eq("node_id", node.id)
    .order("version", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as FileVersionRow[];
  if (rows.length === 0) {
    return [
      {
        id: "current",
        version: 1,
        size: node.size ?? 0,
        createdAt: node.updatedAt,
        blobKey: node.blobKey ?? "",
        isCurrent: true,
      },
    ];
  }
  // Restores re-point the node at an older blob, so several rows can share
  // one blob_path — only the newest matching row is "current".
  let currentSeen = false;
  return rows.map((r) => {
    const isCurrent = !currentSeen && r.blob_path === node.blobKey;
    if (isCurrent) currentSeen = true;
    return {
      id: r.id,
      version: r.version,
      size: r.size,
      createdAt: Date.parse(r.created_at),
      blobKey: r.blob_path,
      isCurrent,
    };
  });
}

/** Baseline row for a file that predates versioning: its current state
    becomes version 1, so history starts with a truthful entry. */
async function ensureBaselineVersion(node: Node, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("file_versions")
    .select("id", { count: "exact", head: true })
    .eq("node_id", node.id);
  if (error) throw error;
  if ((count ?? 0) > 0) {
    const { data, error: maxError } = await supabase
      .from("file_versions")
      .select("version")
      .eq("node_id", node.id)
      .order("version", { ascending: false })
      .limit(1)
      .single<{ version: number }>();
    if (maxError) throw maxError;
    return data.version;
  }
  const { error: insertError } = await supabase.from("file_versions").insert({
    node_id: node.id,
    user_id: userId,
    version: 1,
    blob_path: node.blobKey,
    size: node.size ?? 0,
    created_at: new Date(node.createdAt).toISOString(),
  });
  if (insertError) throw insertError;
  return 1;
}

/** Writes/replaces the searchable text for a file (best-effort caller). */
async function setFileText(
  nodeId: string,
  userId: string,
  content: string | null,
): Promise<void> {
  if (content) {
    await supabase
      .from("file_texts")
      .upsert({ node_id: nodeId, user_id: userId, content });
  } else {
    await supabase.from("file_texts").delete().eq("node_id", nodeId);
  }
}

/**
 * Uploads `file` as the new current version of `node`. The previous state
 * is preserved in the history; name and id stay, so links and rows keep
 * working. Returns the updated node.
 */
export async function uploadNewVersion(
  node: Node,
  file: File,
  contentText?: string | null,
): Promise<Node> {
  const userId = await currentUserId();
  const maxVersion = await ensureBaselineVersion(node, userId);
  const blobPath = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("pdfs")
    .upload(blobPath, file, { contentType: "application/pdf" });
  if (uploadError) throw uploadError;

  const { error: versionError } = await supabase.from("file_versions").insert({
    node_id: node.id,
    user_id: userId,
    version: maxVersion + 1,
    blob_path: blobPath,
    size: file.size,
  });
  if (versionError) {
    await supabase.storage.from("pdfs").remove([blobPath]);
    throw versionError;
  }
  const { data, error } = await supabase
    .from("nodes")
    .update({ blob_path: blobPath, size: file.size })
    .eq("id", node.id)
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) throw error;
  // Content search follows the current version; failure only costs search.
  await setFileText(node.id, userId, contentText ?? null).catch(
    () => undefined,
  );
  return toNode(data);
}

/**
 * Makes an old version current again — as a NEW version pointing at the
 * same blob (linear history, nothing rewritten), the way Drive does it.
 * `contentText` re-indexes search for the restored content.
 */
export async function restoreFileVersion(
  node: Node,
  version: FileVersion,
  contentText?: string | null,
): Promise<Node> {
  const userId = await currentUserId();
  const maxVersion = await ensureBaselineVersion(node, userId);
  const { error: versionError } = await supabase.from("file_versions").insert({
    node_id: node.id,
    user_id: userId,
    version: maxVersion + 1,
    blob_path: version.blobKey,
    size: version.size,
  });
  if (versionError) throw versionError;
  const { data, error } = await supabase
    .from("nodes")
    .update({ blob_path: version.blobKey, size: version.size })
    .eq("id", node.id)
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) throw error;
  await setFileText(node.id, userId, contentText ?? null).catch(
    () => undefined,
  );
  return toNode(data);
}

// ---------------------------------------------------------------------------
// Trash (soft delete) and permanent delete
// ---------------------------------------------------------------------------

export interface TrashItem {
  node: Node;
  deletedAt: number;
  /** Containing dataroom's name; null when the item IS a dataroom. */
  roomName: string | null;
}

interface TrashRow extends NodeRow {
  deleted_at: string;
  room_name: string | null;
}

/**
 * Moves a node (and implicitly its whole subtree) to the trash. Only the
 * root gets deleted_at; every live-tree walk stops at it, so descendants
 * vanish with it and return with it on restore.
 */
export async function trashNode(id: string): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  emitTrashChanged();
}

/** Ancestor chain of a live node (target first excluded), root last. */
async function ancestorIds(id: string): Promise<string[]> {
  const chain: string[] = [];
  let cursor: string | null = id;
  for (let depth = 0; depth < 60 && cursor !== null; depth++) {
    const current: string = cursor;
    const result: { data: { parent_id: string | null } | null } = await supabase
      .from("nodes")
      .select("parent_id")
      .eq("id", current)
      .maybeSingle<{ parent_id: string | null }>();
    const parentId = result.data?.parent_id ?? null;
    if (parentId) chain.push(parentId);
    cursor = parentId;
  }
  return chain;
}

/**
 * Moves nodes into another folder/dataroom (same account, any room).
 * Guards against cycles (a folder can't move into itself or a descendant),
 * skips no-op moves, and resolves name collisions: files get the usual
 * " (N)" suffix, containers try their name first and suffix on conflict.
 * Returns how many nodes actually moved.
 */
export async function moveNodes(
  ids: string[],
  targetParentId: string,
): Promise<number> {
  const target = await getNode(targetParentId);
  if (!target || target.type === "file") {
    throw new Error("That destination no longer exists");
  }
  if (ids.includes(targetParentId)) {
    throw new Error("Can't move a folder into itself");
  }
  const targetChain = new Set(await ancestorIds(targetParentId));
  let moved = 0;
  for (const id of ids) {
    if (targetChain.has(id)) {
      throw new Error("Can't move a folder into one of its own subfolders");
    }
    const node = await getNode(id);
    if (!node || node.parentId === targetParentId) continue;
    if (node.type === "file") {
      const name = await resolveFileName(targetParentId, node.name, id);
      const { error } = await supabase
        .from("nodes")
        .update({ parent_id: targetParentId, name })
        .eq("id", id);
      if (error) throw error;
      moved++;
      continue;
    }
    // Containers: try the current name, suffix on a unique-index conflict.
    let name = node.name;
    for (let attempt = 0; attempt < 100; attempt++) {
      const { error } = await supabase
        .from("nodes")
        .update({ parent_id: targetParentId, name })
        .eq("id", id);
      if (!error) {
        moved++;
        break;
      }
      if (!isUniqueViolation(error)) throw error;
      name = `${node.name} (${attempt + 2})`.slice(0, MAX_NAME_LENGTH);
    }
  }
  return moved;
}

/** Bulk variant of trashNode: one UPDATE for a whole selection. */
export async function trashNodes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("nodes")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
  emitTrashChanged();
}

/** Number of items currently in the trash — powers the floating badge. */
export async function countTrash(): Promise<number> {
  const { count, error } = await supabase
    .from("nodes")
    .select("id", { count: "exact", head: true })
    .not("deleted_at", "is", null);
  if (error) throw error;
  return count ?? 0;
}

/** Everything in the trash, newest first, with dataroom context. */
export async function listTrash(): Promise<TrashItem[]> {
  const { data, error } = await supabase.rpc("list_trash");
  if (error) throw error;
  return ((data ?? []) as TrashRow[]).map((row) => ({
    node: toNode(row),
    deletedAt: Date.parse(row.deleted_at),
    roomName: row.room_name,
  }));
}

/**
 * Restores a trashed node. By default it returns to its original spot; if
 * an ancestor was trashed or purged in the meantime, it re-homes to its
 * dataroom's root, and if the dataroom itself is gone the restore is
 * refused with a clear message. Passing `intoParentId` (drag-out of the
 * trash stack) restores straight into that folder instead. Container name
 * collisions get a numeric suffix.
 */
export async function restoreNode(
  id: string,
  intoParentId?: string,
): Promise<Node> {
  const { data: row, error } = await supabase
    .from("nodes")
    .select(`${NODE_COLUMNS}, deleted_at`)
    .eq("id", id)
    .maybeSingle<NodeRow & { deleted_at: string | null }>();
  if (error) throw error;
  if (!row) throw new Error("This item isn't in the trash");
  // Not a trash ROOT — but it may live INSIDE a trashed subtree (partial
  // restore of a deleted folder's contents). Detach it out instead.
  if (!row.deleted_at) return restoreFromTrashedSubtree(row, intoParentId);

  if (intoParentId) {
    const target = await getNode(intoParentId);
    if (!target || target.type === "file") {
      throw new Error("That destination no longer exists");
    }
    let name = row.name;
    if (row.type === "file") {
      name = await resolveFileName(intoParentId, row.name, id);
    } else {
      const taken = await takenContainerNames(intoParentId, id);
      if (taken.has(name.toLowerCase())) {
        for (let n = 2; n <= 999; n++) {
          const candidate = `${row.name} (${n})`.slice(0, MAX_NAME_LENGTH);
          if (!taken.has(candidate.toLowerCase())) {
            name = candidate;
            break;
          }
        }
      }
    }
    const { data: restored, error: restoreError } = await supabase
      .from("nodes")
      .update({ deleted_at: null, parent_id: intoParentId, name })
      .eq("id", id)
      .select(NODE_COLUMNS)
      .single<NodeRow>();
    if (restoreError) throw restoreError;
    emitTrashChanged();
    return toNode(restored);
  }

  // Walk the ancestor chain: it must be fully live to restore in place.
  interface AncestorRow {
    id: string;
    parent_id: string | null;
    deleted_at: string | null;
  }
  let targetParentId = row.parent_id;
  if (row.parent_id !== null) {
    let cursor: string | null = row.parent_id;
    let chainLive = true;
    let roomId: string | null = null;
    for (let depth = 0; depth < 60 && cursor !== null; depth++) {
      const currentId: string = cursor;
      const result: { data: AncestorRow | null } = await supabase
        .from("nodes")
        .select("id, parent_id, deleted_at")
        .eq("id", currentId)
        .maybeSingle<AncestorRow>();
      const ancestor: AncestorRow | null = result.data;
      if (!ancestor) {
        chainLive = false;
        roomId = null;
        break;
      }
      if (ancestor.deleted_at) chainLive = false;
      if (ancestor.parent_id === null) roomId = ancestor.id;
      cursor = ancestor.parent_id;
    }
    if (!chainLive) {
      if (!roomId) {
        throw new Error(
          "Its dataroom is in the trash — restore the dataroom first",
        );
      }
      targetParentId = roomId; // re-home to the dataroom root
    }
  }

  // Resolve a free name at the destination (containers can't overwrite the
  // live unique index; files follow the usual suffix policy).
  let name = row.name;
  if (row.type === "file") {
    if (targetParentId) {
      name = await resolveFileName(targetParentId, row.name, id);
    }
  } else {
    const taken = await takenContainerNames(targetParentId, id);
    if (taken.has(name.toLowerCase())) {
      const base = name;
      for (let n = 2; n <= 999; n++) {
        const candidate = `${base} (${n})`.slice(0, MAX_NAME_LENGTH);
        if (!taken.has(candidate.toLowerCase())) {
          name = candidate;
          break;
        }
      }
    }
  }

  const { data: restored, error: restoreError } = await supabase
    .from("nodes")
    .update({ deleted_at: null, parent_id: targetParentId, name })
    .eq("id", id)
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (restoreError) throw restoreError;
  emitTrashChanged();
  return toNode(restored);
}

/**
 * Partial restore: the node is NOT marked deleted itself but sits somewhere
 * under a trashed root. Detach it to the given target — or, by default, to
 * the parent the trashed root used to live in (where the user last saw that
 * subtree). The rest of the deleted folder stays in the trash untouched.
 */
async function restoreFromTrashedSubtree(
  row: NodeRow,
  intoParentId?: string,
): Promise<Node> {
  interface AncestorRow {
    id: string;
    parent_id: string | null;
    deleted_at: string | null;
  }
  // Walk up and remember the TOPMOST trashed ancestor: its parent is live
  // by construction (things are always trashed from the live tree).
  let topTrashed: AncestorRow | null = null;
  let cursor: string | null = row.parent_id;
  for (let depth = 0; depth < 60 && cursor !== null; depth++) {
    const currentId: string = cursor;
    const result: { data: AncestorRow | null } = await supabase
      .from("nodes")
      .select("id, parent_id, deleted_at")
      .eq("id", currentId)
      .maybeSingle<AncestorRow>();
    const ancestor: AncestorRow | null = result.data;
    if (!ancestor) break;
    if (ancestor.deleted_at) topTrashed = ancestor;
    cursor = ancestor.parent_id;
  }
  if (!topTrashed) throw new Error("This item isn't in the trash");

  const targetParentId = intoParentId ?? topTrashed.parent_id;
  if (!targetParentId) {
    throw new Error(
      "Its dataroom is in the trash — restore the dataroom first",
    );
  }
  const target = await getNode(targetParentId);
  if (!target || target.type === "file") {
    throw new Error("That destination no longer exists");
  }

  let name = row.name;
  if (row.type === "file") {
    name = await resolveFileName(targetParentId, row.name, row.id);
  } else {
    const taken = await takenContainerNames(targetParentId, row.id);
    if (taken.has(name.toLowerCase())) {
      for (let n = 2; n <= 999; n++) {
        const candidate = `${row.name} (${n})`.slice(0, MAX_NAME_LENGTH);
        if (!taken.has(candidate.toLowerCase())) {
          name = candidate;
          break;
        }
      }
    }
  }

  const { data: restored, error } = await supabase
    .from("nodes")
    .update({ parent_id: targetParentId, name })
    .eq("id", row.id)
    .select(NODE_COLUMNS)
    .single<NodeRow>();
  if (error) throw error;
  emitTrashChanged();
  return toNode(restored);
}

export interface TrashSearchResult {
  node: Node;
  /** The trash root this hit lives under (equals node.id for roots). */
  rootId: string;
  rootName: string;
  isRoot: boolean;
}

interface SearchTrashRow extends NodeRow {
  root_id: string;
  root_name: string;
  is_root: boolean;
}

/** Name search across the trash — roots AND items inside deleted folders. */
export async function searchTrash(
  query: string,
): Promise<TrashSearchResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const { data, error } = await supabase.rpc("search_trash", { query: q });
  if (error) throw error;
  const rows = (data ?? []) as SearchTrashRow[];
  // A trashed root nested under another trashed root appears twice; keep
  // the root-flavored row.
  const seen = new Set<string>();
  const results: TrashSearchResult[] = [];
  for (const r of [...rows].sort(
    (a, b) => Number(b.is_root) - Number(a.is_root),
  )) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    results.push({
      node: toNode(r),
      rootId: r.root_id,
      rootName: r.root_name,
      isRoot: r.is_root,
    });
  }
  return results.sort((a, b) => compareNodes(a.node, b.node));
}

/** Lowercased live container names under a parent (for restore collisions). */
async function takenContainerNames(
  parentId: string | null,
  excludeId?: string,
): Promise<Set<string>> {
  let query = supabase
    .from("nodes")
    .select("id, name")
    .neq("type", "file")
    .is("deleted_at", null);
  query =
    parentId === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", parentId);
  const { data, error } = await query;
  if (error) throw error;
  const taken = new Set<string>();
  for (const row of data ?? []) {
    if (row.id === excludeId) continue;
    taken.add(row.name.toLowerCase());
  }
  return taken;
}

/** Descendant counts for the permanent-delete confirm (target excluded). */
export async function getDeleteCounts(id: string): Promise<DeleteCounts> {
  const { data, error } = await supabase
    .rpc("get_subtree_stats", { node_id: id })
    .single<{ folders: number; files: number }>();
  if (error) throw error;
  return { folders: Number(data.folders), files: Number(data.files) };
}

/**
 * PERMANENT delete. Metadata for the whole subtree is removed by ONE
 * cascading DELETE (all or nothing at the database level). Blob paths are
 * collected first and their storage objects removed after the metadata
 * commit — a failed cleanup can only leave invisible orphan objects, never
 * half-deleted trees.
 */
export async function purgeNode(id: string): Promise<void> {
  // claim_purge_paths both returns the subtree's blob paths AND records
  // storage-delete claims for them — the deleter may not be the uploader
  // (owner purging an editor's file), and the plain own-folder storage
  // policy can't cover that.
  const { data: paths, error: pathsError } = await supabase.rpc(
    "claim_purge_paths",
    { node_id: id },
  );
  if (pathsError) throw pathsError;

  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) throw error;

  const blobPaths = (paths ?? []) as string[];
  for (let i = 0; i < blobPaths.length; i += 100) {
    await supabase.storage.from("pdfs").remove(blobPaths.slice(i, i + 100));
  }
  emitTrashChanged();
}

/** Permanently deletes everything currently in the trash. */
export async function emptyTrash(): Promise<number> {
  const items = await listTrash();
  for (const item of items) {
    await purgeNode(item.node.id);
  }
  return items.length;
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
  /** Matched fragment with [[ ]] highlight markers (content hits only). */
  snippet: string | null;
}

interface SearchRow extends NodeRow {
  parent_name: string;
  content_match: boolean;
  snippet: string | null;
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
    snippet: row.snippet,
  }));
}

export interface GlobalSearchResult extends SearchResult {
  /** The dataroom this hit lives in (equals node.id for dataroom hits). */
  roomId: string;
  roomName: string;
}

interface GlobalSearchRow extends NodeRow {
  parent_name: string | null;
  content_match: boolean;
  snippet: string | null;
  room_id: string;
  room_name: string;
}

/**
 * Name/content search across EVERY live dataroom — powers the home screen
 * search. Dataroom hits carry their own id as roomId; parentName is null
 * for them (they live at the top level).
 */
export async function searchAllNodes(
  query: string,
): Promise<GlobalSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await supabase.rpc("search_all_nodes", {
    query: trimmed,
  });
  if (error) throw error;
  return ((data ?? []) as GlobalSearchRow[]).map((row) => ({
    node: toNode(row),
    parentName: row.parent_name ?? "Home",
    contentMatch: row.content_match,
    snippet: row.snippet,
    roomId: row.room_id,
    roomName: row.room_name,
  }));
}
