# DataRoom

A virtual data room: create datarooms, organize deal documents into nested folders, upload PDFs, and search them — including the text inside the PDFs.

**Live demo:** https://dataroom-self.vercel.app
Sign-up is one step (no email confirmation), or use the demo account: `dataroom.demo.reviewer@gmail.com` / `Demo-DataRoom-2026`

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui · Supabase (Postgres + Storage + Auth) · pdf.js

## What it does

Core:

- Datarooms with names, descriptions and avatars; folders nest without limit
- PDF upload — button or drag & drop anywhere, multi-file; validated by file signature, not just extension
- In-app PDF viewer with a download fallback that is always visible
- Rename everything; duplicate names handled sanely (see decisions below)
- Search within a dataroom by name **and by PDF content** — content hits get a "Text match" tag so the result is explainable

Instead of "Are you sure?" dialogs, deletes are reversible: everything goes to a **trash**, every delete toast has **Undo**, and you can drag items out of the floating trash stack straight back into a folder. The scary confirmation (with exact folder/file counts) only exists for permanent deletes inside the trash.

All three extra-credit items from the brief:

- deployed on Vercel — PDFs in Supabase Storage (private bucket), metadata in Postgres
- email/password auth, per-user row-level security
- search by file name and by document content

And a few things a Drive-style tool is hard to use without: multi-select with bulk download / move / trash, drag & drop moving (rows onto folders, onto breadcrumbs, or "Move to…" across datarooms), light/dark theme, keyboard-friendly dialogs (Enter/Esc, autofocus, focus restore), optimistic updates with toasts on every mutation.

## Run it locally

```bash
git clone https://github.com/vlad54dada-lgtm/dataroom.git
cd dataroom && npm install
npm run dev
```

The backend is a free Supabase project (takes ~2 minutes):

1. Create a project at [supabase.com](https://supabase.com)
2. Open the SQL Editor, paste [`supabase/schema.sql`](supabase/schema.sql), run it — this creates the tables, search functions, storage bucket, and all RLS policies
3. Copy `.env.example` to `.env.local`, fill in the Project URL and anon key (Project Settings → API)

Then `npm run dev` and open http://localhost:3000. Only the publishable anon key is used client-side; authorization is enforced by RLS in Postgres, not by the app.

## How it's built

Client-only SPA — no API routes, no server actions. The browser talks to Supabase through `supabase-js`.

The whole tree is one table:

```
nodes: id, parent_id, type ('dataroom' | 'folder' | 'file'),
       name, size, blob_path, deleted_at, description, icon, color, timestamps
```

- `parent_id = null` means dataroom; everything else hangs off a parent (adjacency list)
- a self-referencing FK with `on delete cascade` makes recursive delete a single `DELETE`
- extracted PDF text lives in a separate `file_texts` table with a GIN index, so tree queries never drag megabytes of document text around
- the few genuinely recursive reads are small SQL functions: subtree counts (for the delete confirm), subtree blob paths (storage cleanup after cascade), search, trash listing

```
app/            home, room/[id], trash, login
components/     granular UI on shadcn/ui — table, row, dialogs, breadcrumbs, …
lib/storage.ts  the ONLY module that touches data
lib/            pdf text extraction, upload validation, dnd helpers, hooks
```

## Design decisions

**One storage seam.** Every read and write goes through `lib/storage.ts`; components never query Supabase. The app started on IndexedDB (the brief suggested mocking persistence) — when I went for the extra credit, swapping IndexedDB for a real backend was one commit (`40d2a0b`) that rewrote the adapter and deleted the Dexie setup. Not a single component changed. This is the decision I'd defend hardest.

**Duplicate names, two policies.** Uploading `report.pdf` twice gives you `report (1).pdf` — an upload should never stop to ask questions. Duplicate folder/dataroom names are blocked with an inline error in the dialog, enforced by a case-insensitive unique index in Postgres — so it holds across tabs and race conditions, not just in UI state.

**Trash + Undo instead of confirmations.** Confirmations don't prevent mistakes; undo fixes them. Delete is instant with an Undo toast, and the trash holds everything until emptied. Soft delete marks only the subtree root — restore brings the whole branch back, and live-tree queries simply never walk through a trashed node.

**The URL is the navigation state.** The current folder is `?folder=<id>`. Refresh, back/forward, and deep links just work; a deleted or unknown id renders a proper not-found state instead of a crash.

**Uploads are paranoid and sequential.** Extension and MIME type can both lie (drag & drop bypasses the file picker's `accept`), so files are checked by magic number (`%PDF`). Files process one at a time: name suffixing stays deterministic, the UI never freezes, and a mixed batch uploads the valid PDFs while one toast lists the rejects.

**Search cost is paid once, at upload.** pdf.js extracts the text layer when a file is uploaded; Postgres full-text search handles queries after that. Scanned PDFs without a text layer quietly fall back to name-only matching.

**No state library.** React hooks plus the adapter cover it. Optimistic updates are local state changes with a rollback-by-refetch on error.

## Edge cases

| Case | What happens |
|---|---|
| Duplicate file name | auto-suffix: `report (1).pdf` |
| Duplicate folder/dataroom name | inline dialog error, enforced by the DB |
| Non-PDF or renamed-to-.pdf files | rejected by signature check; toast lists them; valid files still upload |
| Empty / whitespace / over-long names | confirm disabled with a hint; trimmed on save; 255 max |
| Refresh mid-anything | data is in Postgres, location is in the URL |
| Long names | ellipsis + tooltip, table layout holds |
| Empty states | home, empty folder (doubles as a drop target), no search results, empty trash |
| Rename to the unchanged name | treated as a no-op, closes quietly |
| PDF won't render in the iframe | Download button is always there |
| Deleted or unknown id in the URL | friendly not-found with a way back |
| Zero-byte / huge files | real size shown; sequential processing keeps the UI alive |

## What I'd do next

Sharing — invite by email with viewer/editor roles (RLS makes this a policies problem, not a rewrite). Zip download for folders. Virtualized rows for thousand-file folders. Page thumbnails in the viewer. Playwright e2e to lock the edge cases down.

## Time spent

The core MVP fit roughly in the suggested timebox; the extra credit (Supabase migration, auth, content search) plus two polish passes took about as much again — around two days total, 65 commits.
