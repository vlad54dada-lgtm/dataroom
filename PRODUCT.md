# DataRoom — Product Brief

## What is this

A virtual Data Room MVP — a secure, organized repository for storing and browsing documents during M&A due diligence. Think Google Drive / Dropbox, where each Data Room is a top-level drive containing a folder tree of PDF documents.

**Context:** frontend take-home assignment. Explicit evaluation priority, in this order:

1. **UX and functionality** — intuitive flows, edge cases handled, clear error states
2. **Design and polish** — clean design, NO unimplemented or fake UI elements
3. Code quality and readability

Hard rule: every visible control must work. No dead buttons, no placeholder features.

## Who it's for

Deal teams — lawyers, finance people, founders — who need to organize hundreds of transaction documents into a clear structure and review them quickly. They value trust, clarity, and zero surprises over visual flash.

## Core features

1. **Datarooms** (note: plural — the brief says "create Datarooms"). Home screen is a list of dataroom cards. Users can create, rename, and delete datarooms.
2. **Folders** — create inside a dataroom or inside another folder (unlimited nesting), view contents, rename, delete (cascade: deletes all nested folders and files).
3. **Files** — upload PDF files only (multi-file, button + drag&drop), view the PDF inside the app, rename, delete.
4. **Search** (stretch goal only) — find files/folders by name within the current dataroom.

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

## Edge cases — all must work

1. Duplicate **file** name in the same parent → auto-suffix: `report.pdf` → `report (1).pdf`, `report (2).pdf`.
2. Duplicate **folder/dataroom** name in the same parent → block with an inline error inside the dialog ("A folder with this name already exists").
3. Non-PDF upload → reject with a toast listing the rejected file names. Validate BOTH extension and MIME type in code (dropzone `accept` alone is not enough — drag&drop can bypass it). Mixed batch: upload the valid PDFs, report the invalid ones.
4. Empty or whitespace-only name → confirm button disabled + hint. Trim names on save. Max length 255 chars.
5. Page refresh anywhere → all data intact (persisted in IndexedDB), current folder restored from the URL.
6. Long names → CSS ellipsis + `title` tooltip. Never break the table layout.
7. Empty states everywhere: no datarooms yet, empty folder ("Drop PDF files here or create a folder"), no search results.
8. Rename to the same unchanged name → treat as a no-op, just close the dialog.
9. PDF fails to render in the iframe → the viewer still shows the Download button.
10. Unknown/deleted room or folder id in the URL → friendly "Not found" state with a link back home.
11. Zero-byte or huge files: show the real file size formatted (KB/MB); no artificial size limit, but the UI must never freeze — process uploads sequentially with await.

## Design direction

A professional legal/finance tool, NOT a flashy landing page. Trust and clarity.

- Light theme. Background `#FAFAFA`, white surfaces, borders `#E5E7EB`, primary text `#111827`, secondary `#6B7280`. Accent: deep blue `#1D4ED8` for actions, links, active states. Danger `#DC2626` for destructive actions only.
- Typography: Geist Sans (bundled with Next.js). Sentence case everywhere. 14px base in table rows, generous row height (~48px), subtle row hover.
- Icons: lucide — `Folder` (blue-tinted), `FileText` (red-tinted for PDF), consistent 20px in tables.
- Microcopy: buttons say exactly what they do ("Create folder", not "Submit"). Action names stay consistent through a flow: a "Delete" button produces a "Deleted" toast. Errors are specific and never apologize. Empty states invite action.
- Motion: minimal. One polished moment only — the drag&drop overlay (border highlight + short fade). No scattered animations.
- Every action gives instant feedback: optimistic UI update, toast where appropriate.
- Responsive down to ~768px is enough (desktop-first tool), but nothing should visibly break on mobile.

## Out of scope

Authentication, real backend/blob storage, sharing and permissions, non-PDF file types, full-text content search, dark mode. Do not build any UI for these.

## Success criteria

Every CRUD flow works end-to-end on the deployed Vercel URL. A reviewer actively trying to break the app (duplicate names, refresh mid-flow, weird files, deep nesting, deleting non-empty folders) cannot produce an error, a frozen screen, or lost data.
