#!/usr/bin/env node
/**
 * ShardView — run from inside any project that has Prisma set up.
 */
import { createRequire } from 'module'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
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

// 3. Load the project's own @prisma/client
const targetRequire = createRequire(resolve(projectDir, 'package.json'))
const schemaSrc = readFileSync(schemaPath, 'utf-8')
const customOutput = findGeneratorOutput(schemaSrc, dirname(schemaPath))

let PrismaClient, Prisma, clientSource
try {
  if (customOutput && existsSync(customOutput)) {
    ;({ PrismaClient, Prisma } = targetRequire(customOutput))
    clientSource = customOutput
  } else {
    ;({ PrismaClient, Prisma } = targetRequire('@prisma/client'))
    clientSource = '@prisma/client'
  }
} catch (err) {
  fail(
    'Could not load the Prisma client from this project.',
    `Make sure you have run:  prisma generate\n${customOutput ? `(looked in custom output: ${customOutput})\n` : ''}${err.message}`
  )
}

// 4. Instantiate the client
let prisma
try {
  prisma = new PrismaClient()
} catch (err) {
  fail('Failed to create PrismaClient', err.message)
}

// 5. Check the frontend is built
if (!existsSync(join(DIST, 'index.html'))) {
  fail(
    'Frontend bundle not found.',
    `Build it once from the ShardView source directory:\n  cd ${ROOT}\n  npm run build`
  )
}

// 6. Create Express app: API routes + static frontend
const app = createApiApp({ prisma, Prisma, schemaPath })
app.use(express.static(DIST))
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')))

const PORT = args.port
const url = `http://localhost:${PORT}`

const server = app.listen(PORT, async () => {
  const modelNames = Prisma.dmmf.datamodel.models.map(m => m.name)
  const modelCount = modelNames.length
  const dbSummary = summarizeDbUrl(process.env.DATABASE_URL)

  banner()
  console.log(pad('schema',  rel(schemaPath)))
  console.log(pad('env',     envPath ? rel(envPath) : grey('(none — DATABASE_URL must be in env)'), envPath ? cyan : grey))
  console.log(pad('client',  clientSource === '@prisma/client' ? clientSource : rel(clientSource)))
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
