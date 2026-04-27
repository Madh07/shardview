#!/usr/bin/env node
/**
 * ShardView — run from inside any project that has Prisma set up.
 *
 *   cd your-project
 *   shardview                              # uses ./prisma/schema.prisma + .env
 *   shardview --schema src/schema.prisma
 *   shardview --port 5556
 *   shardview --no-browser
 */
import { createRequire } from 'module'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { createApiApp } from '../server/src/api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'client', 'dist')

// ── helpers ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { port: 5555, browser: true, schema: null, env: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) { args.port = parseInt(argv[++i], 10) }
    else if (argv[i] === '--schema' && argv[i + 1]) { args.schema = argv[++i] }
    else if (argv[i] === '--env' && argv[i + 1]) { args.env = argv[++i] }
    else if (argv[i] === '--no-browser') { args.browser = false }
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
  // Candidates in priority order
  const candidates = [
    join(projectDir, '.env'),
    join(projectDir, '.env.local'),
    join(dirname(schemaPath), '..', '.env'),
  ]
  return candidates.find(existsSync) ?? null
}

async function openBrowser(url) {
  const { exec } = await import('child_process')
  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}`
    : `xdg-open ${url}`
  exec(cmd)
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2))
const projectDir = process.cwd()

// 1. Locate schema
const schemaPath = args.schema
  ? resolve(args.schema)
  : resolve(projectDir, 'prisma', 'schema.prisma')

if (!existsSync(schemaPath)) {
  console.error(`\n✖  No Prisma schema found at: ${schemaPath}`)
  console.error('   Run from a project directory that has prisma/schema.prisma')
  console.error('   or pass --schema <path>\n')
  process.exit(1)
}

// 2. Load environment variables (DATABASE_URL etc.)
const envPath = args.env ? resolve(args.env) : findDotenv(projectDir, schemaPath)
if (envPath) {
  loadDotenv(envPath)
  console.log(`  env  ${envPath}`)
} else {
  console.log('  env  (none found — DATABASE_URL must be set in environment)')
}

// 3. Load the project's own @prisma/client
//    createRequire resolves node_modules from the target project directory.
const targetRequire = createRequire(resolve(projectDir, 'package.json'))

// Detect a custom `output` path in the generator block — modern Prisma projects
// often emit the client outside node_modules (e.g. `output = "./client"`).
function findGeneratorOutput(schemaSrc, schemaDir) {
  const genMatch = schemaSrc.match(/generator\s+\w+\s*{([\s\S]*?)}/)
  if (!genMatch) return null
  const outMatch = genMatch[1].match(/output\s*=\s*"([^"]+)"/)
  if (!outMatch) return null
  return resolve(schemaDir, outMatch[1])
}

const schemaSrc = readFileSync(schemaPath, 'utf-8')
const customOutput = findGeneratorOutput(schemaSrc, dirname(schemaPath))

let PrismaClient, Prisma
try {
  if (customOutput && existsSync(customOutput)) {
    ;({ PrismaClient, Prisma } = targetRequire(customOutput))
    console.log(`  client  ${customOutput}`)
  } else {
    ;({ PrismaClient, Prisma } = targetRequire('@prisma/client'))
  }
} catch (err) {
  console.error('\n✖  Could not load the Prisma client from this project.')
  console.error('   Make sure you have run:  prisma generate')
  if (customOutput) console.error(`   (looked in custom output: ${customOutput})`)
  console.error(`   (${err.message})\n`)
  process.exit(1)
}

// 4. Instantiate the client
let prisma
try {
  prisma = new PrismaClient()
} catch (err) {
  console.error('\n✖  Failed to create PrismaClient:', err.message, '\n')
  process.exit(1)
}

// 5. Check the frontend is built
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('\n✖  Frontend not built. Run this once from the ShardView source directory:')
  console.error(`   cd ${ROOT} && npm run build\n`)
  process.exit(1)
}

// 6. Create Express app: API routes + static frontend
const app = createApiApp({ prisma, Prisma, schemaPath })
app.use(express.static(DIST))
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')))

const PORT = args.port
const url = `http://localhost:${PORT}`

app.listen(PORT, async () => {
  const modelNames = Prisma.dmmf.datamodel.models.map(m => m.name)
  console.log('')
  console.log('  ShardView')
  console.log('')
  console.log(`  schema  ${schemaPath}`)
  console.log(`  models  ${modelNames.join(', ')}`)
  console.log(`  url     ${url}`)
  console.log('')
  if (args.browser) await openBrowser(url)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
