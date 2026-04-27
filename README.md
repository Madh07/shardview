# ShardView

A self-hosted database browser for any [Prisma](https://www.prisma.io/) project.
Drop into a project, point it at your schema, get a fast UI to browse, filter,
edit and bulk-mutate your data.

```bash
cd path/to/your-prisma-project
npx shardview
```

That's it — your default browser opens at `http://localhost:5555`.

ShardView reads your project's `schema.prisma` at runtime, loads your project's
own `@prisma/client` (so it works with whatever Prisma version you use),
introspects models via the DMMF and serves a React UI that runs entirely on
your machine.

## Features

- **Tabs** — open as many models as you want; tabs are draggable, persist
  across reloads, support `Cmd/Ctrl+click` (open in new tab),
  `Cmd/Ctrl+W` (close), middle-click and a right-click context menu.
- **Sidebar** — searchable model list, drag-reorderable pinned section,
  resizable width, dark mode.
- **Inline editing** — click any cell to edit. Enums, booleans, dates, numbers,
  scalar lists and relations all have appropriate editors. FK scalars accept
  pasted IDs; relation cells expose a picker that opens a paginated table of
  the related model.
- **Multi-row filters** — compose any number of conditions, switch between
  AND/OR group, and follow relation paths up to two hops deep
  (e.g. `post.author.email contains "..."`). Export the active filter as a
  ready-to-paste Prisma snippet.
- **Mass edit** — select rows, choose which fields to apply, run a single
  `updateMany`.
- **Cascade delete** — for projects whose schema doesn't declare
  `onDelete: Cascade`, optionally walk every FK reference and remove
  dependents recursively.
- **Pivot views** — models with two or more FKs are detected as join tables
  and offer two extra views (joined-row and cards) that show the connected
  entities side-by-side, all inline-editable. Single relation cells whose
  target is a pivot get a split button that jumps directly to the model on
  the other side.
- **No backend required** — the API runs in-process; nothing leaves your
  machine.

## Usage

```bash
# inside a project that has prisma set up
npx shardview

# point at a different schema, change port, don't open browser
npx shardview --schema src/db/schema.prisma --port 5556 --no-browser

# load a specific .env file
npx shardview --env .env.staging
```

### CLI options

| Option            | Default                  | Description                                  |
| ----------------- | ------------------------ | -------------------------------------------- |
| `--schema <path>` | `./prisma/schema.prisma` | Path to the Prisma schema file.              |
| `--port <num>`    | `5555`                   | Port to bind the local server.               |
| `--env <path>`    | auto-discovered          | Custom dotenv file to load before starting.  |
| `--no-browser`    | _(open by default)_      | Skip launching the default browser on boot.  |

### Requirements

- Node.js 18+
- A project with `prisma` and `@prisma/client` installed and a `DATABASE_URL`
  reachable from your machine.
- Run `prisma generate` first if you haven't already.

ShardView resolves `@prisma/client` from your project's `node_modules`, or
from a custom `output` path declared in the schema's `generator` block — so
both classic and modern Prisma layouts work.

## Install globally (optional)

```bash
npm install -g shardview
shardview              # then just type 'shardview' anywhere
```

`npx shardview` is recommended for occasional use; install globally if you
reach for it daily.

## How it works

ShardView ships two halves:

- **API** — an Express app generated at startup from your project's DMMF.
  Every endpoint operates on model names dynamically; no schema is hardcoded.
- **UI** — a single-page React app served as static files from the same
  process.

There is no shadow database, no migration step, no extra service. Schema
introspection happens in-process the moment the CLI starts.

## License

[BSD 3-Clause](./LICENSE) © 2026 max@segf.net
