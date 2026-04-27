// Build a Prisma `where` JS object from the FilterBar state, mirroring the
// logic on the server. Used to generate copyable source code for the user.

function coerce(value, type) {
  if (type === 'Int') return parseInt(value, 10)
  if (type === 'Float' || type === 'Decimal') return parseFloat(value)
  if (type === 'Boolean') return value === true || value === 'true'
  return value
}

function buildOpClause(op, rawValue, fieldType) {
  const v = coerce(rawValue, fieldType)
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const isString = fieldType === 'String'
  switch (op) {
    case 'equals': return { equals: v }
    case 'not': return { not: v }
    case 'contains': return isString ? { contains: v, mode: 'insensitive' } : null
    case 'startsWith': return isString ? { startsWith: v, mode: 'insensitive' } : null
    case 'endsWith': return isString ? { endsWith: v, mode: 'insensitive' } : null
    case 'gt': return { gt: v }
    case 'gte': return { gte: v }
    case 'lt': return { lt: v }
    case 'lte': return { lte: v }
    default: return null
  }
}

function resolveTerminal(baseSchema, schemaCache, path) {
  let cur = baseSchema
  let terminal = null
  for (let i = 0; i < path.length; i++) {
    const f = cur?.fields.find(ff => ff.name === path[i])
    if (!f) return null
    if (i === path.length - 1) { terminal = f; break }
    if (f.kind !== 'object') return null
    cur = schemaCache[f.type]
    if (!cur) return null
  }
  if (!terminal || terminal.kind === 'object') return null
  return terminal
}

function buildPathClause(baseSchema, schemaCache, path, opClause) {
  function wrap(schema, idx) {
    const fName = path[idx]
    if (idx === path.length - 1) return { [fName]: opClause }
    const f = schema.fields.find(ff => ff.name === fName)
    if (!f || f.kind !== 'object') return null
    const next = schemaCache[f.type]
    if (!next) return null
    const inner = wrap(next, idx + 1)
    if (!inner) return null
    return f.isList ? { [fName]: { some: inner } } : { [fName]: inner }
  }
  return wrap(baseSchema, 0)
}

export function buildWhereObject({ filters, filterMode, baseSchema, schemaCache, search }) {
  const valid = (filters || []).filter(f =>
    Array.isArray(f.path) && f.path.length > 0
    && f.op
    && f.value !== '' && f.value !== null && f.value !== undefined
  )
  const clauses = []
  for (const f of valid) {
    const terminal = resolveTerminal(baseSchema, schemaCache, f.path)
    if (!terminal) continue
    const opClause = buildOpClause(f.op, f.value, terminal.type)
    if (!opClause) continue
    const c = buildPathClause(baseSchema, schemaCache, f.path, opClause)
    if (c) clauses.push(c)
  }

  let group = null
  if (clauses.length === 1) group = clauses[0]
  else if (clauses.length > 1) group = { [filterMode === 'OR' ? 'OR' : 'AND']: clauses }

  // The toolbar search produces an OR over all string scalar fields
  let searchClause = null
  if (search && baseSchema) {
    const strFields = baseSchema.fields.filter(f =>
      f.type === 'String' && f.kind === 'scalar' && !f.isList && !f.isReadOnly
    )
    if (strFields.length > 0) {
      searchClause = { OR: strFields.map(f => ({ [f.name]: { contains: search, mode: 'insensitive' } })) }
    }
  }

  if (!group && !searchClause) return null
  if (group && searchClause) return { AND: [searchClause, group] }
  return group || searchClause
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function jsLiteral(v, indent = '') {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    const inner = v.map(x => indent + '  ' + jsLiteral(x, indent + '  ')).join(',\n')
    return '[\n' + inner + '\n' + indent + ']'
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 0) return '{}'
    const inner = keys.map(k => {
      const key = IDENT_RE.test(k) ? k : JSON.stringify(k)
      return indent + '  ' + key + ': ' + jsLiteral(v[k], indent + '  ')
    }).join(',\n')
    return '{\n' + inner + '\n' + indent + '}'
  }
  return String(v)
}

export function buildPrismaSnippet({ modelName, where, orderBy, orderDir, page, pageSize }) {
  const delegate = modelName ? modelName.charAt(0).toLowerCase() + modelName.slice(1) : 'model'
  const args = {}
  if (where) args.where = where
  if (orderBy) args.orderBy = { [orderBy]: orderDir || 'asc' }
  if (typeof page === 'number' && typeof pageSize === 'number' && page > 0) {
    if (page > 1) args.skip = (page - 1) * pageSize
    args.take = pageSize
  }
  if (Object.keys(args).length === 0) {
    return `prisma.${delegate}.findMany()`
  }
  return `prisma.${delegate}.findMany(${jsLiteral(args, '')})`
}

export { jsLiteral }
