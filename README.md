# DataRoom

A virtual data room: create datarooms, organize deal documents into nested folders, upload PDFs, and search them — including the text inside the PDFs.

**Live demo:** https://dataroom-self.vercel.app
Sign-up is one step (no email confirmation), or use the demo account: `dataroom.demo.reviewer@gmail.com` / `Demo-DataRoom-2026`

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui · Supabase (Postgres + Storage + Auth) · pdf.js · Playwright

## What it does

Core:

- Datarooms with names, descriptions and avatars; folders nest without limit
- PDF upload — button or drag & drop anywhere, multi-file, with a progress panel (per-file status, cancel, honest failure labels); a second drop mid-batch queues up instead of breaking
- Built-in PDF viewer on pdf.js: continuous scroll, fit-width zoom, "Page X of N", lazy page rendering that releases memory on long documents, keyboard zoom — with a graceful iframe fallback per file
- Search within a dataroom by name **and by PDF content** — hits show a highlighted snippet of the matched text, a "Text match" badge, and a jump-to-containing-folder button; the query lives in the URL so refresh keeps it
- Sortable columns (name / size / modified — asc / desc / default), folders always grouped on top

It behaves like the file managers people already know:

- **Full keyboard model**: arrows walk rows, Enter opens, Space selects, F2 renames, Delete trashes, Ctrl/Cmd+A selects all, Esc clears, `/` or Ctrl/Cmd+K focuses search
- **Right-click context menu** on rows (Open / Download / Rename / Move to… / Move to trash), mirrored in the kebab menu
- Click a row to select it, shift+click for a range, click empty canvas to clear
- Drag & drop everywhere: rows onto folders or breadcrumbs to move, onto the trash button to delete, out of the trash stack to restore — with drop-target highlights and a floating hint naming the valid targets
- Deletes are reversible: everything goes to a **trash** with Undo on every toast (moves have Undo too); deleted folders expand in the trash so single files can be pulled out; permanent deletion is hold-to-confirm or an explicit dialog with real recursive counts

All three extra-credit items from the brief:

- deployed on Vercel — PDFs in Supabase Storage (private bucket), metadata in Postgres with per-user row-level security
- email/password auth (one-step sign-up, deep links restored after sign-in)
- search by file name and by document content

Quality details that don't fit a bullet list: optimistic updates with rollback on every mutation, data revalidation when the tab regains focus, folder contents prefetched on hover so navigation feels instant, a route-level error boundary, per-route document titles, live regions and consistent focus rings for assistive tech, light/dark themes, and a shared motion system (one easing vocabulary, enter/exit pairs, reduced-motion guards).

## Tests

End-to-end suite (Playwright) covering the flows above against the real backend — sign-up, dataroom/folder/file CRUD, duplicate-name policies, upload validation and suffixing, the viewer, content search with snippets, trash/undo/partial restore, and the keyboard model. Each run registers a fresh throwaway account, so runs are hermetic.

```bash
npx playwright install chromium   # once
npm run test:e2e
```

15 scenarios, ~1 minute against the dev server (it reuses one if already running).

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
- the few genuinely recursive reads are small SQL functions: subtree counts (for delete confirms), subtree blob paths (storage cleanup after cascade), live-tree search with `ts_headline` snippets, trash search and listing

```
app/            home, room/[id], trash, login, error boundary
components/     granular UI on shadcn/ui — table, row, dialogs, viewer, …
lib/storage.ts  the ONLY module that touches data
lib/            pdf text extraction, upload validation, dnd helpers, hooks
tests/e2e/      Playwright suite (in-memory PDF fixture generator included)
```

## Design decisions

**One storage seam.** Every read and write goes through `lib/storage.ts`; components never query Supabase. The app started on IndexedDB (the brief suggested mocking persistence) — when I went for the extra credit, swapping IndexedDB for a real backend was one commit (`40d2a0b`) that rewrote the adapter and deleted the Dexie setup. Not a single component changed. This is the decision I'd defend hardest.

**Duplicate names, two policies.** Uploading `report.pdf` twice gives you `report (1).pdf` — an upload should never stop to ask questions. Duplicate folder/dataroom names are blocked with an inline error in the dialog, enforced by a case-insensitive unique index in Postgres — so it holds across tabs and race conditions, not just in UI state.

**Trash + Undo instead of confirmations.** Confirmations don't prevent mistakes; undo fixes them. Delete is instant with an Undo toast, and the trash holds everything until emptied. Soft delete marks only the subtree root — restore brings the whole branch back, single files can be pulled out of a deleted folder individually, and live-tree queries simply never walk through a trashed node.

**The URL is the state.** The current folder is `?folder=<id>`, the search query is `?q=`. Refresh, back/forward, and deep links just work — and signing in returns you to the page you were heading to.

**Uploads are paranoid and sequential.** Extension and MIME type can both lie (drag & drop bypasses the file picker's `accept`), so files are checked by magic number. Files process one at a time through a single queue: name suffixing stays deterministic, one broken file never sinks the batch, and closing the tab mid-upload warns first.

**Search cost is paid once, at upload.** pdf.js extracts the text layer when a file is uploaded; Postgres full-text search handles queries after that, returning `ts_headline` fragments so every hit is explainable. Scanned PDFs without a text layer quietly fall back to name-only matching.

**No state library.** React hooks plus the adapter cover it, with a small stale-while-revalidate cache that also powers hover prefetching and focus revalidation.

## Edge cases

| Case | What happens |
|---|---|
| Duplicate file name | auto-suffix: `report (1).pdf` |
| Duplicate folder/dataroom name | inline dialog error, enforced by the DB |
| Non-PDF or renamed-to-.pdf files | rejected by signature check; toast lists them; valid files still upload |
| Empty / whitespace / over-long names | submit answers with a shake + inline error; trimmed on save; 255 max |
| Refresh mid-anything | data is in Postgres, location and search are in the URL |
| Long names | ellipsis + tooltip, table layout holds |
| Empty states | home, empty folder (doubles as a drop target), no search results, empty trash |
| Rename to the unchanged name | treated as a no-op, closes quietly |
| PDF won't render | per-file iframe fallback; Download is always visible |
| Deleted or unknown id in the URL | friendly not-found with a way back |
| Zero-byte / huge files | real size shown; sequential queue keeps the UI alive |
| Render error anywhere | error boundary with retry, not a white screen |

## What I'd do next

Realtime sync between open windows (Supabase Realtime — the plumbing is one subscription away). Password reset flow. Sharing — invite by email with viewer/editor roles (RLS makes this a policies problem, not a rewrite). Zip download for folders. Virtualized rows for thousand-file folders.

## Time spent

The core MVP fit roughly in the suggested timebox; the extra credit (Supabase migration, auth, content search), the interaction-polish passes (keyboard model, drag & drop, viewer), and the e2e suite grew it to about three days total across ~75 commits.
