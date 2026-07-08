# DataRoom — Product Brief

> Updated 2026-07-04: the product outgrew the original MVP brief (cloud
> persistence, auth, content search, trash, bulk actions, dark theme) and
> the design register was elevated to a serious legal platform. This
> document describes the CURRENT product; the original take-home scope is
> preserved in git history.
>
> Updated 2026-07-08: access & sharing v2 — public file/folder links,
> dataroom membership with viewer/editor roles, open tracking, and the
> Sharing & access panel. The former "no sharing" scope line is history.
>
> Updated 2026-07-08: access & sharing v3 — per-file/per-folder email grants
> with viewer/editor roles (Drive-style), a grantee "Shared with you" that
> lists individual files/folders, and a subtree-scoped view for shared folders.

## What is this

A virtual Data Room — a secure, organized repository for storing and browsing documents during M&A due diligence. Think Google Drive / Dropbox, where each Data Room is a top-level drive containing a folder tree of PDF documents.

**Context:** frontend take-home assignment. Explicit evaluation priority, in this order:

1. **UX and functionality** — intuitive flows, edge cases handled, clear error states
2. **Design and polish** — clean design, NO unimplemented or fake UI elements
3. Code quality and readability

Hard rule: every visible control must work. No dead buttons, no placeholder features.

## Who it's for

Deal teams — lawyers, finance people, founders — who need to organize hundreds of transaction documents into a clear structure and review them quickly. They value trust, clarity, and zero surprises over visual flash.

## Core features

1. **Datarooms** (note: plural — the brief says "create Datarooms"). Home screen is a grid of dataroom cards with an icon/color identity per room, drag-to-reorder, create/edit/delete via dialogs.
2. **Folders** — create inside a dataroom or inside another folder (unlimited nesting), view contents, rename, delete (cascade: deletes all nested folders and files).
3. **Files** — upload PDF files only (multi-file, button + drag&drop), view the PDF inside the app in a custom viewer (paging, zoom, in-document search, CONFIDENTIAL watermark), rename, delete, download.
4. **Search** — global and per-room: file/folder names AND PDF content (Postgres full-text over text extracted at upload), with All/Files/Folders filters and result locations.
5. **Auth & cloud persistence** — email/password accounts (Supabase Auth); nodes in Postgres under RLS, PDF blobs in private Storage. Each user sees only their own datarooms.
6. **Trash** — deleted items land in a trash (floating access bottom-right) and can be restored to their original location, restored into a picked folder, or purged; bulk select/restore/purge; drag out of the trash stack onto a room card to restore.
7. **Bulk actions** — row checkboxes with shift-range select; selection bar with Download / Move to / Move to trash.
8. **Theme** — light and dark, toggle on every screen including login; gentle cross-fade on switch.
9. **Public share links** — a file or folder can be made "anyone with the link": an unguessable token URL opens the document (or a read-only folder browser) in the product UI with no account. Links are always view-only, revocable, and track opens (count + last opened).
10. **Dataroom membership** — the owner invites people by email with a role: **viewer** (read and download everything) or **editor** (full content CRUD — upload, rename, move, trash, versions — but no access management and no changes to the room itself). Invitees sign up with the invited email and the room appears in their home and rail under "Shared with you".
11. **Per-file & per-folder grants** — the owner can also share a single file or folder with specific people by email, with the same viewer/editor roles (Drive-style). A grantee sees ONLY that object under "Shared with you" — never the rest of the dataroom — and opens a shared folder in a subtree-scoped view (breadcrumbs stop at the shared node). Only the room owner grants; grants die when the object is moved to another owner's room.
12. **Sharing & access panel** — one page (`/access`, via the account menu) listing every public link (with open stats, copy, revoke), every room member and every file/folder grant (change role, remove), plus everything shared with you — rooms, files, and folders (leave).

## Screens & flows

1. **Home `/`** — grid of dataroom cards (name, item count, created date). Create dataroom via dialog. Rename/delete via kebab menu on each card. Empty state with a clear CTA.
2. **Dataroom view `/room/[id]`**:
   - Breadcrumbs: Home / Dataroom name / … / Current folder. The current folder id lives in the URL (`?folder=<id>`) so refresh and back/forward restore the exact location.
   - Toolbar: "New folder" button, "Upload" button, search input (stretch only).
   - Items table (Google Drive list view): folders first, then files. Columns: Name (icon + name), Size (files only), Last modified. Kebab menu per row: Rename, Delete.
   - Click a folder row → navigate into it. Click a file row → open the PDF viewer.
3. **Upload** — "Upload" button + full-area drag&drop with a visible drop overlay. Multi-file. PDF only.
4. **PDF viewer** — full-screen dialog: filename in the header, the PDF rendered in an `<iframe>` via object URL, plus a "Download" button as fallback. Revoke the object URL on close.
5. **Dialogs** — create dataroom, create folder, rename, delete confirm. Delete confirm for a non-empty folder must say: "This will permanently delete N folders and M files." Enter submits, Esc closes, autofocus on the input with text pre-selected when renaming.
6. **Share dialog** — on any file or folder row (owner only): create/copy/revoke the public link, see open stats. On a dataroom: manage members (invite by email + role, change role, remove, copy invite link).
7. **Public share page `/share/[token]`** — no auth. A file renders in the full viewer; a folder renders a read-only browser (breadcrumbs within the shared subtree, `?folder=` in the URL, files open in the viewer).
8. **Sharing & access `/access`** — the owner's control panel: public links table with open stats, members grouped by room, rooms shared with you.

## Edge cases — all must work

1. Duplicate **file** name in the same parent → one prompt before the batch starts: **Upload as new version** (default — the file joins the existing document's version history) or **Keep both** (auto-suffix: `report.pdf` → `report (1).pdf`). Uploads never stop mid-queue to ask.
2. Duplicate **folder/dataroom** name in the same parent → block with an inline error inside the dialog ("A folder with this name already exists").
3. Non-PDF upload → reject with a toast listing the rejected file names. Validate BOTH extension and MIME type in code (dropzone `accept` alone is not enough — drag&drop can bypass it). Mixed batch: upload the valid PDFs, report the invalid ones.
4. Empty or whitespace-only name → confirm button disabled + hint. Trim names on save. Max length 255 chars.
5. Page refresh anywhere → all data intact (persisted in Supabase), current folder restored from the URL.
6. Long names → CSS ellipsis + `title` tooltip. Never break the table layout.
7. Empty states everywhere: no datarooms yet, empty folder ("Drop PDF files here or create a folder"), no search results.
8. Rename to the same unchanged name → treat as a no-op, just close the dialog.
9. PDF fails to render in the iframe → the viewer still shows the Download button.
10. Unknown/deleted room or folder id in the URL → friendly "Not found" state with a link back home.
11. Zero-byte or huge files: show the real file size formatted (KB/MB); no artificial size limit, but the UI must never freeze — process uploads sequentially with await.

## Design direction

A serious legal/finance platform — the register of an institution handling a multi-billion-dollar deal, not a consumer SaaS. Trust, restraint, clarity.

- **Typography — "letterhead".** Source Serif 4 is fenced to display moments only: wordmarks, page titles, dialog titles, empty/error states. Geist Sans carries ALL UI controls, labels, table data, and body. Global tabular numerals; 11px tracked-uppercase ledger caps for table headers. Sentence case everywhere.
- **Color — "ledger ink".** Light: white surfaces on a cool canvas, slate ink `#0F172A`, authority navy `#1E3A8A` for actions/links/focus (white on navy ≥10:1). Dark: navy-tinted slate surfaces with a steel accent `#6F97D9`. Documents are graphite, folders navy — no consumer rose/red on the most common glyphs. Danger `#DC2626` family for destructive actions only. Room identity lives in the avatar tile alone (muted registrar tones, eight stored keys); no color washes on surfaces.
- **Material.** Hairline borders, tight elevation (depth is a hint, not a float), solid header, no frosted glass, no glow shadows. Radii stay modest (cards 12px).
- **Motion — "still ledger".** Motion conveys state, never decorates: 150–250ms, strong ease-out only (no overshoot or elastic easing anywhere), quiet fades over choreography, exits faster than enters, `prefers-reduced-motion` respected everywhere. The one flourish is the fly-to-trash arc — functional feedback showing where deleted items went.
- Microcopy: buttons say exactly what they do ("Create folder", not "Submit"). Action names stay consistent through a flow: a "Delete" button produces a "Deleted" toast. Errors are specific and never apologize. Empty states invite action.
- Every action gives instant feedback: optimistic UI update, toast where appropriate.
- Responsive down to ~768px is enough (desktop-first tool), but nothing should visibly break on mobile.

## Sharing rules — all must hold

1. Public links are **view-only** and exist for files and folders, never for a whole dataroom.
2. Only the **room owner** creates or revokes public links and manages members and per-node grants. Editors and viewers see no sharing controls at all.
2a. A **per-node grantee** sees only the shared file/folder and its subtree — never siblings, ancestors, or the room's trash. Tampering with a URL above or outside the grant reads as "not found". Access derives from a grant on the node OR any ancestor; the strongest role wins if someone is both a room member and a grantee.
3. An anonymous visitor with a folder link can browse **only that subtree** — tampering with ids outside it reads as "link isn't available".
4. Revoking a link or removing a member takes effect immediately (database-enforced, not UI-enforced).
5. A viewer can read and download everything in the room but cannot change anything — including restoring versions or seeing the room's trash.
6. An editor's uploads belong to the room: the owner sees, opens, and can purge them (including their storage blobs).
7. Sharing state must be visible where the object lives: shared rows and cards carry a badge.

## Out of scope

Audit logs beyond link-open counts, link passwords/expiry UI, email notifications for invites, non-PDF file types, Q&A workflows. Do not build any UI for these.

## Success criteria

Every CRUD flow works end-to-end on the deployed Vercel URL. A reviewer actively trying to break the app (duplicate names, refresh mid-flow, weird files, deep nesting, deleting non-empty folders) cannot produce an error, a frozen screen, or lost data.
