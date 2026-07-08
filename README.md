# DataRoom

[![CI](https://github.com/vlad54dada-lgtm/dataroom/actions/workflows/ci.yml/badge.svg)](https://github.com/vlad54dada-lgtm/dataroom/actions/workflows/ci.yml)

A virtual data room for M&A due diligence: datarooms, nested folders, PDF documents, and search that looks inside the documents.

**Live demo:** https://dataroom-self.vercel.app
Demo account: `dataroom.demo.reviewer@gmail.com` / `Demo-DataRoom-2026` — or sign up in one step, no email confirmation.

Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui · Supabase (Postgres + Storage + Auth) · pdf.js · Playwright

## Beyond the brief

The brief asks for folder/file CRUD. This ships that, plus what a deal team actually needs in the first hour:

- **Search inside documents.** Text is extracted from each PDF at upload; Postgres full-text search answers queries with a highlighted snippet showing *why* a document matched.
- **Name collisions resolved like a data room, not a file dump.** Uploading a same-named PDF asks once: *new version* (joins the document's history, restorable) or *keep both* (`report (1).pdf`).
- **A real document viewer.** Canvas rendering, page thumbnails, in-document find, zoom, keyboard paging, and a per-user CONFIDENTIAL watermark on every page.
- **Trash + Undo instead of confirmation dialogs.** Deletes are instant and reversible; a single file can be pulled out of a deleted folder.
- **Drive-grade interactions.** Full keyboard model, right-click menus, shift-range selection, drag & drop for move, delete, restore, and reorder.
- **Security enforced by the database, not the UI.** Row-level security scopes every tree to its owner and invited members in Postgres; PDFs live in a private bucket; the browser only ever holds the publishable key.
- **Sharing that matches how deals work.** Public view-only links for files *and* folders (anonymous browsing of just that subtree), dataroom membership with viewer/editor roles, open tracking, and a single Sharing & access panel to see and revoke everything.
- **CI you can click.** The badge above runs lint, the production build, and 45 end-to-end scenarios in three engines — Chromium, WebKit, and mobile Safari — against the real backend on every push.

## Feature summary

- Datarooms with icons, colors, and descriptions; folders nest without limit; drag cards to reorder the home grid (persisted)
- A collapsible dataroom rail inside every room (desktop) — switch rooms in one click, current room highlighted, list scrolls under soft fade masks
- Multi-file PDF upload by button or drag & drop, with a progress panel: per-file status, cancel, honest failure labels; a second drop mid-batch queues instead of breaking
- File versioning: upload a new version, browse history, restore any previous one
- Search scoped to a room or across all rooms, by name and content, with type filters — the query lives in the URL, so refresh and deep links keep it
- Sortable columns; optimistic updates with rollback on every mutation; data revalidates when the tab regains focus; folder contents prefetch on hover
- Public share links for files and folders — view-only, no sign-in, revocable, with open counts; folders open a read-only browser scoped to the shared subtree
- Dataroom membership: invite by email as viewer or editor; shared rooms appear under "Shared with you"; every RLS policy knows the difference
- A Sharing & access panel (`/access`) listing all links and members in one place
- Light and dark themes, `prefers-reduced-motion` support, live regions and visible focus for assistive tech

## Tests

Playwright end-to-end suite against the real backend: CRUD, duplicate and version policies, upload validation, the viewer, content search, trash and partial restore, the keyboard model. Each run registers a fresh throwaway account, so runs are hermetic. The same 15 scenarios run in **Chromium, WebKit (Safari), and mobile Safari (iPhone viewport)**.

```bash
npx playwright install chromium webkit   # once
npm run test:e2e
```

## Run it locally

```bash
git clone https://github.com/vlad54dada-lgtm/dataroom.git
cd dataroom && npm install
```

Backend is a free Supabase project (~2 minutes): create one at [supabase.com](https://supabase.com), run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor (tables, search functions, bucket, RLS policies — everything), copy `.env.example` to `.env.local`, fill in the URL and anon key. Then `npm run dev`.

## Architecture

Client-only SPA — no API routes, no server actions. The browser talks to Supabase through one seam:

```
app/            home, room/[id], trash, login
components/     granular UI on shadcn/ui
lib/storage.ts  the ONLY module that touches data
tests/e2e/      Playwright suite
```

The whole tree is one table — `nodes (id, parent_id, type, name, size, blob_path, deleted_at, …)`. A dataroom is a node with `parent_id = null`; a self-referencing FK with `on delete cascade` makes recursive delete a single `DELETE`. Extracted PDF text lives in a separate GIN-indexed table so tree queries stay light. The few recursive reads (subtree counts, search with snippets) are small SQL functions.

**Why the seam matters:** the app started on IndexedDB, as the brief suggests. Moving to a real backend was one commit that rewrote `lib/storage.ts` — no component changed. Sharing and roles then followed the same path: a denormalized `root_id` on every node, membership-aware RLS policies, and a handful of `SECURITY DEFINER` functions for the anonymous link surface — all behind the same seam.

**The access model in one paragraph:** every node carries the id of its dataroom (`root_id`, trigger-maintained). One SQL function, `room_access(room)`, answers "owner / editor / viewer / stranger" and every RLS policy on nodes, texts, versions, and storage objects delegates to it. Public links are capability tokens: anonymous visitors resolve them through narrow `SECURITY DEFINER` RPCs that return exactly the shared subtree and nothing else. An editor's move/rename/upload powers are symmetric with the owner's over *content*, but the room row itself and all sharing controls answer only to the owner.

## Design

The register is deliberate: **an institution's ledger, not a consumer app**. Deal teams read trust in restraint.

- **Type:** a serif (Source Serif 4) only for display moments — wordmark, page and dialog titles; a neutral sans for every control and row of data; tabular numerals throughout.
- **Color:** authority navy on cool paper; documents graphite, folders navy. Red appears only on destructive actions. Every text/background pair is WCAG-AA measured, and the measurements live as comments next to the tokens.
- **Motion:** conveys state, never decorates — 150–250ms, one ease-out curve, no bounce, exits faster than enters.

A data room is a working table, so the design goes denser and cooler than the fashionable warm-minimal look: hairline borders, ledger-caps table headers, quiet chiseled icon tiles. Both themes are first-class and contrast-verified separately.

## Engineering decisions

- **Duplicate names, two policies.** Files prompt for version-vs-copy once per batch, before the queue starts — uploads never stop mid-flight to ask. Folder and dataroom duplicates are blocked by a case-insensitive unique index *in Postgres*, so the rule survives tabs and races, not just UI state.
- **Uploads are paranoid.** Extension and MIME can both lie, so every file is verified by its `%PDF-` signature. Files process sequentially: one broken file never sinks the batch; closing the tab mid-upload warns first.
- **Search cost is paid once, at upload.** Extraction happens client-side on the way in; queries are pure Postgres afterwards. Scanned PDFs without a text layer quietly fall back to name matching.
- **The URL is the state.** Current folder and search query live in query params — refresh, back/forward, and deep links just work, and sign-in returns you to where you were headed.
- **No state library.** React hooks, the storage seam, and a small stale-while-revalidate cache with a write-generation guard so a slow in-flight fetch can never overwrite an optimistic update.

## Edge cases

| Case | What happens |
|---|---|
| Duplicate file name | one prompt per batch: new version (default) or keep both |
| Duplicate folder/dataroom name | inline dialog error, enforced by the DB |
| Non-PDF or renamed-to-.pdf file | rejected by signature check; valid files in the batch still upload |
| Empty / whitespace / over-long name | shake + inline error; trimmed on save; 255 max |
| Refresh mid-anything | data is in Postgres, location and search are in the URL |
| Long names | ellipsis + tooltip; the table never breaks |
| PDF won't render | per-file iframe fallback; Download always visible |
| Deleted or unknown id in the URL | friendly not-found with a way back |
| Zero-byte / huge files | real size shown; the sequential queue keeps the UI alive |
| Render error anywhere | error boundary with retry, not a white screen |

## What's next

**Audit log** — who opened which document, when (public links already count opens; member-level trails are the next step); core value in real due diligence. **Link controls** — passwords and expiry dates on public links (the schema already carries `expires_at`). Email notifications for invites. Realtime sync between open windows. Zip download for folders. Virtualized rows for thousand-file folders. Language-aware search stemming.

One accepted v1 trade-off: an editor can move room content into their own room — symmetric with their existing download-and-recreate powers, but a future audit log should record it.
