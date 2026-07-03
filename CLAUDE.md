# CLAUDE.md

## Project

DataRoom — a virtual data room MVP (frontend take-home). **Read `PRODUCT.md` first** — it defines all functional requirements, screens, edge cases, and the design direction. This file defines how to build it.

## Stack

> Updated after the extra-credit cloud migration (2026-07-02): persistence
> and auth moved from IndexedDB to Supabase at the user's request.

- Next.js 16 (App Router) + TypeScript **strict mode**, Tailwind v4 (CSS-first `@theme`)
- shadcn/ui + lucide-react, sonner (toasts), react-dropzone (uploads)
- **Supabase**: Postgres (node metadata, RLS per user), Storage (PDF blobs, private bucket `pdfs`), Auth (email/password)
- pdfjs-dist: text extraction at upload for content search (Postgres FTS)
- Client-only Next.js app (no API routes, no server actions) — all backend concerns live in Supabase, reached via supabase-js.

## Commands

```bash
npm run dev      # local dev server
npm run build    # production build — MUST pass before every commit
npm run lint     # eslint
```

## Project structure

```
app/
  page.tsx                 # home: dataroom list
  room/[id]/page.tsx       # dataroom view (client component)
components/
  ui/                      # shadcn components only
  dataroom-card.tsx, items-table.tsx, breadcrumbs.tsx,
  upload-dropzone.tsx, pdf-viewer-dialog.tsx,
  name-dialog.tsx, delete-dialog.tsx, empty-state.tsx
lib/
  supabase.ts              # Supabase browser client (singleton)
  storage.ts               # storage adapter — the ONLY module doing data CRUD
  extract-pdf-text.ts      # pdf.js text extraction for content search
  utils.ts                 # formatBytes, name helpers, cn
types/
  index.ts                 # Node, NodeType
```

Auth surfaces (app/login, app/reset-password, components/require-auth,
components/user-menu, lib/hooks/use-session) may import the Supabase client
directly; everything else goes through `lib/storage.ts`.

## Architecture

### Data model

```ts
type NodeType = 'dataroom' | 'folder' | 'file'

interface Node {
  id: string              // crypto.randomUUID()
  parentId: string | null // null = dataroom (root)
  type: NodeType
  name: string
  createdAt: number
  updatedAt: number
  size?: number           // files only, bytes
  blobKey?: string        // files only
}
```

### Storage adapter (`lib/storage.ts`)

The single seam between UI and persistence. Async API:
`createNode`, `getNode`, `listChildren(parentId)`, `renameNode`, `deleteNodeRecursive`, `saveFile(parentId, file, contentText?)`, `getBlob(blobKey)`, `getDeleteCounts(id)`, `countChildren(parentId)`, `searchNodes(rootId, query)`.

- Backed by Supabase: `nodes` table (RLS per user; case-insensitive unique index blocks duplicate container names; self-FK cascade deletes subtrees) and Storage bucket `pdfs` (`{userId}/{uuid}.pdf`, `blobKey` = object path).
- `deleteNodeRecursive`: collect subtree blob paths (RPC), one cascading metadata DELETE, then best-effort storage cleanup.
- Name policy lives here (not in components): file duplicates get " (1)" suffixes client-side; folder/dataroom duplicates surface the DB unique violation as a typed error the dialog renders inline.
- The seam was proven: the Dexie → Supabase swap touched only this file (see git history at 40d2a0b).

## Rules

### Always

- All data access goes through `lib/storage.ts`. Components never query Supabase directly (auth surfaces are the only exception, and only for auth).
- TypeScript strict; no `any`, no `@ts-ignore`.
- Validate names in the storage layer AND reflect errors in the UI (disabled buttons, inline messages).
- Optimistic UI updates + toast feedback for every mutation.
- Implement every edge case listed in `PRODUCT.md` — they are requirements, not suggestions.
- Conventional commits (`feat:`, `fix:`, `chore:`) after each completed feature.
- Run `npm run build` before every commit; fix all errors before committing.
- UI copy in sentence case; follow the microcopy rules in `PRODUCT.md`.

### Never

- Never ship a visible control that does nothing (no fake buttons, no "coming soon").
- Never use localStorage for files or app state — everything goes through the adapter.
- Never add API routes or server actions — backend concerns live in Supabase.
- Never add state libraries (Redux/Zustand) — React hooks + the adapter are enough.
- Never add a dependency beyond the stack above without a strong reason.
- Never commit with a failing build or console errors.
- Never commit secrets — Supabase keys live in `.env.local` (gitignored) and Vercel env; only the publishable anon key is used client-side.

## Workflow

Build in this order, committing after each step:

1. Scaffold: Next.js 15 + TS + Tailwind + shadcn init + install dexie, react-dropzone; add sonner via shadcn. Verify `npm run build` passes.
2. `types/`, `lib/db.ts`, `lib/storage.ts` — full adapter with name policy and recursive delete.
3. Home screen: dataroom CRUD + empty state.
4. Dataroom view: breadcrumbs, URL-driven folder navigation, items table.
5. Folder CRUD (create, rename, delete with confirm + counts).
6. Upload: button + drag&drop, PDF validation, sequential processing, toasts.
7. PDF viewer dialog with download fallback.
8. File rename/delete; polish pass on empty states, focus management, keyboard (Enter/Esc).

Then: walk through EVERY edge case from `PRODUCT.md` in the browser using the Playwright MCP (click through, screenshot, verify). Fix everything found, then one final adversarial pass trying to break the app.

Finally write `README.md`: live demo link, features, quick start (3 commands), architecture + data model, key decisions and trade-offs (IndexedDB vs in-memory, duplicate-name policy, storage adapter as backend seam, why no auth/backend in the timebox), table of handled edge cases, "what I'd do next", honest time spent.

## Definition of done

- All CRUD flows for datarooms, folders, and files work end-to-end **on the deployed Vercel URL**, not just localhost.
- All 11 edge cases from `PRODUCT.md` verified in the browser.
- Zero console errors, zero dead controls, zero unimplemented UI.
- README complete; repo history shows incremental conventional commits.
