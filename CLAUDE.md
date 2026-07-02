# CLAUDE.md

## Project

DataRoom — a virtual data room MVP (frontend take-home). **Read `PRODUCT.md` first** — it defines all functional requirements, screens, edge cases, and the design direction. This file defines how to build it.

## Stack

- Next.js 15 (App Router) + TypeScript **strict mode**
- Tailwind CSS + shadcn/ui + lucide-react
- Dexie (IndexedDB) for persistence — metadata AND PDF blobs
- sonner (toasts), react-dropzone (uploads)
- 100% client-side. No API routes, no server actions, no server code.

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
  db.ts                    # Dexie schema (the only file that defines stores)
  storage.ts               # storage adapter — the ONLY module allowed to query Dexie
  utils.ts                 # formatBytes, name helpers, cn
types/
  index.ts                 # Node, NodeType
```

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

The single seam between UI and persistence. Async API that mimics a real backend:
`createNode`, `getNode`, `listChildren(parentId)`, `renameNode`, `deleteNodeRecursive`, `saveFile(parentId, file)`, `getBlob(blobKey)`, `searchByName(rootId, query)`.

- Dexie stores: `nodes` (indexes: `parentId`, `[parentId+name]`) and `blobs` (`blobKey → Blob`).
- `deleteNodeRecursive`: collect all descendant ids, delete nodes + their blobs in ONE Dexie transaction.
- Name policy lives here (not in components): file duplicates get " (1)" suffixes; folder/dataroom duplicates throw a typed error the dialog renders inline.
- Swapping mock → real backend later must mean rewriting only this file. State this in the README.

## Rules

### Always

- All data access goes through `lib/storage.ts`. Components never import Dexie directly.
- TypeScript strict; no `any`, no `@ts-ignore`.
- Validate names in the storage layer AND reflect errors in the UI (disabled buttons, inline messages).
- Optimistic UI updates + toast feedback for every mutation.
- Implement every edge case listed in `PRODUCT.md` — they are requirements, not suggestions.
- Conventional commits (`feat:`, `fix:`, `chore:`) after each completed feature.
- Run `npm run build` before every commit; fix all errors before committing.
- UI copy in sentence case; follow the microcopy rules in `PRODUCT.md`.

### Never

- Never ship a visible control that does nothing (no fake buttons, no "coming soon").
- Never use localStorage for files or app state — IndexedDB via the adapter only.
- Never add server code, API routes, or auth.
- Never add state libraries (Redux/Zustand) — React hooks + the adapter are enough.
- Never add a dependency beyond the stack above without a strong reason.
- Never commit with a failing build or console errors.

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
