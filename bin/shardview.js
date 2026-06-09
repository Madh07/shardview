#!/usr/bin/env node
/**
 * ShardView — run from inside any project that has Prisma set up.
 */
import { createRequire } from 'module'
import { existsSync, readFileSync, statSync, readdirSync } from 'fs'
import { resolve, dirname, join, relative, isAbsolute } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import express from 'express'
import { createApiApp } from '../server/src/api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'client', 'dist')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))

// ── tty / color helpers ──────────────────────────────────────────────────────

const useColor = process.stdout.isTTY && process.env.NO_COLOR !== '1'
const c = (code, s) => useColor ? `\x1b[${code}m${s}\x1b[0m` : s
const dim       = s => c('2', s)
const bold      = s => c('1', s)
const red       = s => c('31', s)
const green     = s => c('32', s)
const yellow    = s => c('33', s)
const blue      = s => c('34', s)
const magenta   = s => c('35', s)
const cyan      = s => c('36', s)
const grey      = s => c('90', s)

function fail(msg, hint) {
  console.error('')
  console.error(`  ${red('✖')}  ${msg}`)
  if (hint) for (const line of hint.split('\n')) console.error(`     ${dim(line)}`)
  console.error('')
  process.exit(1)
}

function printHelp() {
  const w = bold
  console.log(`
  ${bold(magenta('ShardView'))}  ${dim(`v${PKG.version}`)}
  ${dim('Self-hosted database browser for Prisma projects.')}

  ${bold('USAGE')}
    ${cyan('shardview')} [options]

  ${bold('OPTIONS')}
    ${w('--port')} ${dim('<n>')}            HTTP port to listen on               ${dim('(default: 5555)')}
    ${w('--schema')} ${dim('<path>')}       Path to schema.prisma                 ${dim('(default: prisma/schema.prisma)')}
    ${w('--env')} ${dim('<path>')}          Path to .env file                     ${dim('(default: auto-discover)')}
    ${w('--no-browser')}           Do not open the browser on start
    ${w('--no-color')}             Disable ANSI colors in output
    ${w('-h')}, ${w('--help')}             Show this help and exit
    ${w('-v')}, ${w('--version')}          Show version and exit

  ${bold('EXAMPLES')}
    ${dim('# from a project with prisma/schema.prisma + .env')}
    ${cyan('shardview')}

    ${dim('# custom port and schema location')}
    ${cyan('shardview --port 5556 --schema src/db.prisma')}

    ${dim('# headless run (e.g. inside docker/CI)')}
    ${cyan('shardview --no-browser --port 8080')}

  ${bold('LEARN MORE')}
    ${dim(PKG.homepage || 'https://github.com/callb4ck/shardview')}
`)
}

function parseArgs(argv) {
  const args = { port: 5555, browser: true, schema: null, env: null, help: false, version: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' && argv[i + 1]) args.port = parseInt(argv[++i], 10)
    else if (a === '--schema' && argv[i + 1]) args.schema = argv[++i]
    else if (a === '--env' && argv[i + 1]) args.env = argv[++i]
    else if (a === '--no-browser') args.browser = false
    else if (a === '--no-color') process.env.NO_COLOR = '1'
    else if (a === '-h' || a === '--help') args.help = true
    else if (a === '-v' || a === '--version') args.version = true
    else fail(`Unknown argument: ${a}`, 'Run `shardview --help` to see available options.')
  }
  if (Number.isNaN(args.port) || args.port < 1 || args.port > 65535) {
    fail(`Invalid --port value: ${argv[argv.indexOf('--port') + 1]}`, 'Port must be an integer in 1..65535.')
  }
  return args
}

function loadDotenv(filePath) {
  if (!filePath || !existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function findDotenv(projectDir, schemaPath) {
  const candidates = [
    join(projectDir, '.env'),
    join(projectDir, '.env.local'),
    join(dirname(schemaPath), '..', '.env'),
  ]
  return candidates.find(existsSync) ?? null
}

function findGeneratorOutput(schemaSrc, schemaDir) {
  const genMatch = schemaSrc.match(/generator\s+\w+\s*{([\s\S]*?)}/)
  if (!genMatch) return null
  const outMatch = genMatch[1].match(/output\s*=\s*"([^"]+)"/)
  if (!outMatch) return null
  return resolve(schemaDir, outMatch[1])
}

// Parse `datasource db { provider = "..." }` from the schema. Drives which
// driver adapter to construct under Prisma 7 (which requires an adapter).
function findDatasourceProvider(schemaSrc) {
  const dsMatch = schemaSrc.match(/datasource\s+\w+\s*{([\s\S]*?)}/)
  if (!dsMatch) return null
  const m = dsMatch[1].match(/provider\s*=\s*"([^"]+)"/)
  return m ? m[1] : null
}

// Collect every .prisma source for getDMMF. Supports both a single schema
// file and Prisma's multi-file "schema folder" layout. When the path is a file
// we only pull in sibling .prisma files if there's more than one (a folder
// schema), otherwise we stick to the single file to avoid grabbing unrelated
// schemas that happen to live in the same directory.
function loadSchemaSources(schemaPath) {
  const isDir = statSync(schemaPath).isDirectory()
  const walk = dir => {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (entry.name.endsWith('.prisma')) out.push(full)
    }
    return out
  }
  let files
  if (isDir) {
    files = walk(schemaPath)
  } else {
    const siblings = readdirSync(dirname(schemaPath))
      .filter(n => n.endsWith('.prisma'))
      .map(n => join(dirname(schemaPath), n))
    files = siblings.length > 1 ? siblings : [schemaPath]
  }
  return files.map(p => ({ path: p, content: readFileSync(p, 'utf-8') }))
}

// Dynamic-import a module from the target project. Prisma 7's generated client
// and its driver adapters are ESM-only and live outside node_modules, so a CJS
// `require` no longer works — we resolve a concrete file and `import()` it.
//  - absolute path → import the file (or probe known entry files in a dir)
//  - bare specifier → resolve through the target project's node_modules,
//    falling back to its package.json "exports"/"module"/"main" when
//    require.resolve can't (ESM-only packages with no `require` condition).
async function loadModule(spec, targetRequire) {
  if (isAbsolute(spec)) {
    let file = spec
    if (existsSync(spec) && statSync(spec).isDirectory()) {
      // Prefer compiled JS if present; otherwise fall back to the generator's
      // TypeScript entry (`client.ts`), which Node imports via type-stripping
      // (Node 22.6+ with --experimental-strip-types, on by default in 23.6+).
      const probe = ['client.js', 'client.mjs', 'client.ts', 'index.js', 'index.mjs', 'index.ts']
        .map(f => join(spec, f)).find(existsSync)
      if (probe) file = probe
    }
    return import(pathToFileURL(file).href)
  }
  let entry
  try {
    entry = targetRequire.resolve(spec)
  } catch {
    const pj = targetRequire.resolve(`${spec}/package.json`)
    const pkg = JSON.parse(readFileSync(pj, 'utf-8'))
    const exp = pkg.exports?.['.']
    const sub = (typeof exp === 'string' ? exp : (exp?.import || exp?.default || exp?.node))
      || pkg.module || pkg.main || 'index.js'
    entry = resolve(dirname(pj), typeof sub === 'string' ? sub : (sub.import || sub.default))
  }
  return import(pathToFileURL(entry).href)
}

// Known Prisma driver adapters keyed by datasource provider. The constructor
// arg shape differs per package and — crucially — passing the wrong shape does
// NOT throw (e.g. better-sqlite3 accepts `{ connectionString }`, silently
// leaving `url` undefined, then crashes at query time on `url.replace`). So we
// pass the correct shape per package rather than probing blindly.
//  - pg / postgres / cockroach → `{ connectionString }`
//  - better-sqlite3 / libsql   → `{ url }`
//  - mariadb / mssql           → connection-string URI
const pgArgs    = u => [{ connectionString: u }]
const urlArgs   = u => [{ url: u }]
const uriArgs   = u => [u, { url: u }, { connectionString: u }]
const ADAPTERS = {
  postgresql:  [{ pkg: '@prisma/adapter-pg',             export: 'PrismaPg',           args: pgArgs }],
  postgres:    [{ pkg: '@prisma/adapter-pg',             export: 'PrismaPg',           args: pgArgs }],
  cockroachdb: [{ pkg: '@prisma/adapter-pg',             export: 'PrismaPg',           args: pgArgs }],
  mysql:       [{ pkg: '@prisma/adapter-mariadb',        export: 'PrismaMariaDb',      args: uriArgs }],
  mariadb:     [{ pkg: '@prisma/adapter-mariadb',        export: 'PrismaMariaDb',      args: uriArgs }],
  sqlite:      [{ pkg: '@prisma/adapter-better-sqlite3', export: 'PrismaBetterSqlite3', args: urlArgs },
                { pkg: '@prisma/adapter-libsql',         export: 'PrismaLibSQL',       args: urlArgs }],
  sqlserver:   [{ pkg: '@prisma/adapter-mssql',          export: 'PrismaMssql',        args: uriArgs }],
}

// Build a driver adapter for the given provider, trying each candidate package
// with its known constructor signature(s). Returns null if nothing usable is
// installed in the target project (caller surfaces a helpful error).
async function buildAdapter(provider, url, targetRequire) {
  const candidates = ADAPTERS[provider] || []
  for (const cand of candidates) {
    let mod
    try { mod = await loadModule(cand.pkg, targetRequire) } catch { continue }
    const Adapter = mod[cand.export] || mod.default?.[cand.export] || mod.default
    if (typeof Adapter !== 'function') continue
    for (const arg of cand.args(url)) {
      try { return { adapter: new Adapter(arg), pkg: cand.pkg } } catch {}
    }
  }
  return null
}

// Mask credentials in a connection URL but keep the protocol + host so the
// user can confirm which database they're connected to without exposing the
// password in logs.
function summarizeDbUrl(raw) {
  if (!raw) return null
  try {
    const u = new URL(raw)
    const proto = u.protocol.replace(':', '')
    const userPart = u.username ? `${u.username}${u.password ? ':•••' : ''}@` : ''
    const dbPart = u.pathname && u.pathname !== '/' ? u.pathname : ''
    return `${proto}://${userPart}${u.host}${dbPart}`
  } catch {
    if (raw.startsWith('file:')) return raw  // SQLite-style relative path
    return '<unparseable URL>'
  }
}

async function openBrowser(url) {
  const { exec } = await import('child_process')
  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}`
    : `xdg-open ${url}`
  exec(cmd)
}

function rel(p) {
  const r = relative(process.cwd(), p)
  return r.startsWith('..') || r === '' ? p : r
}

function pad(label, value, color = cyan) {
  return `  ${grey(label.padEnd(10))}${color(value)}`
}

function banner() {
  const v = `v${PKG.version}`
  const title = `ShardView`
  const line = `${bold(magenta(title))} ${dim(v)}`
  console.log('')
  console.log(`  ${line}`)
  console.log(`  ${dim('Prisma database browser')}`)
  console.log('')
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2))

if (args.help) { printHelp(); process.exit(0) }
if (args.version) { console.log(PKG.version); process.exit(0) }

const projectDir = process.cwd()

// 1. Locate schema
const schemaPath = args.schema
  ? resolve(args.schema)
  : resolve(projectDir, 'prisma', 'schema.prisma')

if (!existsSync(schemaPath)) {
  fail(
    `No Prisma schema found at: ${schemaPath}`,
    'Run from a project directory that has prisma/schema.prisma\nor pass --schema <path>.\n\nRun `shardview --help` for usage.'
  )
}

// 2. Load environment variables (DATABASE_URL etc.)
const envPath = args.env ? resolve(args.env) : findDotenv(projectDir, schemaPath)
if (envPath) loadDotenv(envPath)

// 3. Load the project's own Prisma client.
//    Prisma 7's `prisma-client` generator emits an ESM-only client into a
//    custom `output` directory (no longer node_modules), so we dynamic-import
//    `<output>/client.js`. Older `prisma-client-js` projects keep their client
//    in `@prisma/client`. We try the custom output first, then the package.
const targetRequire = createRequire(resolve(projectDir, 'package.json'))
const schemaSrc = readFileSync(schemaPath, 'utf-8')
const customOutput = findGeneratorOutput(schemaSrc, dirname(schemaPath))
const datasourceProvider = findDatasourceProvider(schemaSrc)

const clientCandidates = []
if (customOutput) clientCandidates.push(customOutput)
clientCandidates.push('@prisma/client')

let PrismaClient, Prisma, clientSource, loadErr
for (const cand of clientCandidates) {
  try {
    const mod = await loadModule(cand, targetRequire)
    // CJS clients imported via import() expose their members under `default`.
    const ns = mod?.PrismaClient ? mod : (mod?.default || {})
    if (ns.PrismaClient) {
      PrismaClient = ns.PrismaClient
      Prisma = ns.Prisma
      clientSource = cand
      break
    }
    loadErr = new Error(`Module "${cand}" did not export PrismaClient`)
  } catch (err) { loadErr = err }
}
if (!PrismaClient) {
  fail(
    'Could not load the Prisma client from this project.',
    `Make sure you have run:  prisma generate\n${customOutput ? `(looked in custom output: ${customOutput})\n` : ''}${loadErr?.message || ''}`
  )
}

// 4. Instantiate the client. Prisma 7 requires a driver adapter (or an
//    Accelerate URL) — `new PrismaClient()` throws otherwise. We attempt the
//    plain constructor first (works for <=6 and for prisma:// Accelerate URLs)
//    and, if it complains about a missing adapter, build one from the
//    datasource provider using the adapter package installed in the project.
let prisma
let adapterPkg = null
const dbUrl = process.env.DATABASE_URL
try {
  // Works for Prisma <=6 and for prisma:// Accelerate URLs on 7.
  prisma = new PrismaClient()
} catch (errPlain) {
  // Prisma 7 rejects the bare constructor (it needs a driver adapter). The
  // exact wording varies by version, so we don't pattern-match it — we just
  // build an adapter from the datasource provider and retry.
  if (!dbUrl) {
    fail('Prisma 7 requires a database connection to build a driver adapter.',
      `DATABASE_URL is not set. Put it in your .env (or pass --env <file>).\n${errPlain.message}`)
  }
  const built = await buildAdapter(datasourceProvider, dbUrl, targetRequire)
  if (!built) {
    const pkgs = (ADAPTERS[datasourceProvider] || []).map(a => a.pkg)
    fail(
      `Could not construct a PrismaClient for provider "${datasourceProvider || 'unknown'}".`,
      (pkgs.length
        ? `Prisma 7 needs a driver adapter. Install it in this project, e.g.:\n  npm install ${pkgs[0]}\n`
        : `No known adapter for this provider. Supported: ${Object.keys(ADAPTERS).join(', ')}.\n`)
      + `Original error: ${errPlain.message}`
    )
  }
  try {
    prisma = new PrismaClient({ adapter: built.adapter })
    adapterPkg = built.pkg
  } catch (err2) {
    fail('Failed to create PrismaClient with a driver adapter', `${built.pkg}: ${err2.message}`)
  }
}

// 4b. Resolve a full DMMF. Prisma 7's new client either omits `Prisma.dmmf`
//     or exposes a stripped-down version missing the metadata ShardView relies
//     on (isId, relationFromFields, nativeType, primaryKey, …). When the
//     runtime DMMF isn't complete we parse the schema with `@prisma/internals`
//     getDMMF — resolved from the project first (matching its Prisma version),
//     then from ShardView's own dependency as a fallback.
function isFullDmmf(d) {
  // Prisma 7's stripped runtime DMMF gives only {name, kind, type} per field;
  // the full document includes flags like isId. Use that as the marker.
  const f = d?.datamodel?.models?.[0]?.fields?.[0]
  return Boolean(f && 'isId' in f)
}
let dmmf = Prisma?.dmmf
if (!isFullDmmf(dmmf)) {
  // Prefer the project's own @prisma/internals (version-matched); fall back to
  // the copy bundled with ShardView. Prisma 7 stopped shipping @prisma/internals
  // as a transitive install, so the bundled copy is the usual source here.
  // The module is CJS, so named exports may sit under `.default`.
  let getDMMF
  for (const how of [
    () => loadModule('@prisma/internals', targetRequire),
    () => import('@prisma/internals'),
  ]) {
    try {
      const mod = await how()
      getDMMF = mod.getDMMF || mod.default?.getDMMF
      if (getDMMF) break
    } catch {}
  }
  if (!getDMMF) {
    fail(
      'Could not introspect the schema (full DMMF unavailable).',
      'Prisma 7 no longer exposes a complete runtime DMMF, so ShardView reads it\nvia @prisma/internals getDMMF — which ships with ShardView. Try reinstalling\nShardView, or add @prisma/internals to this project.'
    )
  }
  const sources = loadSchemaSources(schemaPath)
  // getDMMF accepts a single datamodel string; for multi-file schemas we
  // concatenate (the lone datasource/generator blocks survive the merge). The
  // structured {path,content}[] form is only accepted by some versions, so it's
  // the fallback.
  const joined = sources.map(s => s.content).join('\n\n')
  try {
    dmmf = await getDMMF({ datamodel: joined })
  } catch {
    dmmf = await getDMMF({ datamodel: sources })
  }
}

// 5. Check the frontend is built
if (!existsSync(join(DIST, 'index.html'))) {
  fail(
    'Frontend bundle not found.',
    `Build it once from the ShardView source directory:\n  cd ${ROOT}\n  npm run build`
  )
}

// 6. Create Express app: API routes + static frontend
const app = createApiApp({ prisma, dmmf, Prisma, schemaPath, provider: datasourceProvider })
app.use(express.static(DIST))
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')))

const PORT = args.port
const url = `http://localhost:${PORT}`

const server = app.listen(PORT, async () => {
  const modelNames = dmmf.datamodel.models.map(m => m.name)
  const modelCount = modelNames.length
  const dbSummary = summarizeDbUrl(process.env.DATABASE_URL)

  banner()
  console.log(pad('schema',  rel(schemaPath)))
  console.log(pad('env',     envPath ? rel(envPath) : grey('(none — DATABASE_URL must be in env)'), envPath ? cyan : grey))
  console.log(pad('client',  clientSource === '@prisma/client' ? clientSource : rel(clientSource)))
  if (adapterPkg) console.log(pad('adapter', adapterPkg))
  console.log(pad('database',dbSummary || grey('(DATABASE_URL not set)'), dbSummary ? cyan : yellow))
  console.log(pad('models',  `${modelCount} ${dim(modelCount > 0 ? `· ${modelNames.slice(0, 8).join(', ')}${modelCount > 8 ? ` … (+${modelCount - 8} more)` : ''}` : '')}`))
  console.log('')
  console.log(`  ${green('▸')} ${bold('Listening on')}  ${cyan(url)}`)
  console.log(`  ${grey('  Press Ctrl-C to stop')}`)
  console.log('')

  if (args.browser) await openBrowser(url)
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    fail(`Port ${PORT} is already in use.`, `Pass a different port:\n  shardview --port ${PORT + 1}`)
  }
  fail('Server error', err.message)
})

// Graceful shutdown
let shuttingDown = false
async function shutdown(sig) {
  if (shuttingDown) return
  shuttingDown = true
  process.stdout.write(`\n  ${grey(`${sig} received — disconnecting…`)}\n`)
  try { await prisma.$disconnect() } catch {}
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
