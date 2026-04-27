# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ShardView** is a self-hosted Prisma database browser. It introspects any project's Prisma schema at runtime and serves a React UI for browsing, filtering, and editing data. It runs as a CLI (`bin/shardview.js`) inside any project that already has Prisma set up — it loads the target project's own `@prisma/client` via `createRequire`, so it works with whatever Prisma version that project uses.

## Commands

### Build the frontend bundle (required before running the CLI)
```bash
npm run build       # vite build → client/dist/
```

### Run inside a target project
```bash
cd /path/to/target-project
node /path/to/this-repo/bin/shardview.js
node /path/to/this-repo/bin/shardview.js --schema src/schema.prisma --port 5556 --no-browser
```
The CLI:
1. Loads `.env` from the target project (or `--env <file>`) for `DATABASE_URL`.
2. Resolves `@prisma/client` from the target project's `node_modules` (or from a custom `output` path declared in the schema's `generator` block).
3. Spins up Express on the chosen port (default 5555), serves the API + the prebuilt UI from `client/dist/`.

### Hot-reload during tool development
With the CLI running on its default port (5555) inside a target project, you can run `vite` separately:
```bash
npm run dev --workspace=client
```
Vite serves on `http://localhost:3000` and proxies `/api` → `http://localhost:5555`.

## Architecture

### Two halves of the codebase

| Layer | Entry point |
|---|---|
| API + DMMF introspection | `server/src/api.js` |
| React UI | `client/src/main.jsx` |

`bin/shardview.js` glues them: it builds the Express API via `createApiApp({ prisma, Prisma, schemaPath })` and then mounts `express.static(client/dist)` plus an SPA catch-all.

### The API layer (`server/src/api.js`)

`createApiApp({ prisma, Prisma, schemaPath })` is the only export. It receives:
- `prisma` — a PrismaClient instance from the target project
- `Prisma` — the Prisma namespace (for DMMF access)
- `schemaPath` — path to schema.prisma (used only to parse `/// @enum` annotations)

**DMMF is the source of truth** for schema introspection. `Prisma.dmmf.datamodel.models` drives every endpoint — no code needs to know model names at compile time. Model delegates are accessed by lowercasing the first letter of the model name (`prisma[modelName[0].toLowerCase() + modelName.slice(1)]`).

**Relation loading**: the records endpoint automatically builds a Prisma `include` at request time — single relations (`kind: 'object', !isList`) are fully included; list relations use `_count` so counts appear without fetching full arrays. FK sort guard prevents ordering by relation fields.

**Filters**: `filters=<json>` query param accepts an array of `{ path: [seg…], op, value }` (max 3 segments → up to 2 relation hops). The server resolves the terminal field type, coerces the value, builds nested where clauses (`some` for list relations) and combines them in a single AND/OR group via `filterMode`.

**Pivot view**: `/api/pivot/:pivotModel` returns each pivot record with all of its connected sides included, plus side metadata (fields, FK, idField, relName) so the UI can render either a "joined row" or a "card" view and inline-edit any side.

**Cascade delete**: when `?cascade=true` is sent, the server walks every model's FK relations pointing at the target and recursively deletes dependents before the target itself. Use when the schema doesn't declare `onDelete: Cascade`.

**`/// @enum VALUE,VALUE` annotations** in schema comments allow plain `String` fields to be rendered as enum dropdowns alongside native Prisma enums. These are parsed from the raw schema file, not from DMMF.

### The React frontend (`client/src/`)

State lives in `App.jsx`. There is no external state library. Tab UI: each open model is its own tab with isolated state (`page`, `pageSize`, `orderBy`, `orderDir`, `search`, `filters`, `filterMode`, `filterOpen`, `pivotMode`, `selectedRows`). Tabs and active tab are persisted in `localStorage` so the view survives a reload. Schemas of related models are cached in a `schemaCache` map and pre-fetched eagerly for pivots.

Key components:
- `Sidebar` — model list with search, drag-reorderable pinned section, dark-mode toggle, resizable width, right-click context menu.
- `TabBar` — drag-to-reorder tabs.
- `Toolbar` — search, filter toggle, pivot-view cycler, mass-edit, delete, add.
- `FilterBar` — multi-row filter UI with nested relation path picker (cascading selects) and AND/OR mode toggle.
- `DataTable` — inline editor, scalar-list editor, single-relation picker, split relation cell that jumps "through" pivots to the connected model.
- `RelationPickerTable` — modal table picker shared by AddRecord, MassEdit and through-pivot navigation.
- `PivotView` — two view modes for pivot models (joined row, cards), inline-editing on every side.
- `ConfirmDeleteModal` / `MassEditModal` / `ExportQueryModal` — modal flows.
