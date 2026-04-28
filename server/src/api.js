import express from 'express'
import cors from 'cors'
import { readFileSync, existsSync } from 'fs'

// Parse /// @enum VALUE,VALUE annotations from schema so plain String fields
// can opt into a dropdown editor in the UI (alongside native Prisma enums).
function parseEnumAnnotations(schemaPath) {
  if (!schemaPath || !existsSync(schemaPath)) return {}
  try {
    const result = {}
    const lines = readFileSync(schemaPath, 'utf-8').split('\n')
    for (let i = 0; i < lines.length - 1; i++) {
      const m = lines[i].match(/\/\/\/\s*@enum\s+(.+)/)
      if (m) {
        const fm = lines[i + 1].match(/^\s+(\w+)\s+/)
        if (fm) result[fm[1]] = m[1].split(',').map(v => v.trim())
      }
    }
    return result
  } catch { return {} }
}

export function createApiApp({ prisma, Prisma, schemaPath }) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // Serialize BigInt safely
  app.use((_req, res, next) => {
    const orig = res.json.bind(res)
    res.json = (data) => orig(JSON.parse(JSON.stringify(data, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )))
    next()
  })

  const { dmmf } = Prisma
  const modelMap = Object.fromEntries(dmmf.datamodel.models.map(m => [m.name, m]))
  const enumMap = Object.fromEntries(dmmf.datamodel.enums.map(e => [e.name, e]))
  const enumAnnotations = parseEnumAnnotations(schemaPath)

  function getDelegate(modelName) {
    const key = modelName.charAt(0).toLowerCase() + modelName.slice(1)
    return prisma[key]
  }

  function getIdField(modelName) {
    const field = modelMap[modelName]?.fields.find(f => f.isId)
    return field?.name ?? 'id'
  }

  function isCompositeId(modelName) {
    return modelMap[modelName]?.primaryKey !== null
  }

  // A pivot model is one that has only id/FK scalar fields (and standard
  // timestamps) plus relation references — i.e. its sole purpose is to
  // connect two or more other models (M2M join tables, role-permission
  // assignments, etc.).
  function isPivotModel(model) {
    const fkSet = new Set()
    model.fields.forEach(f => {
      if (f.kind === 'object' && !f.isList && Array.isArray(f.relationFromFields)) {
        f.relationFromFields.forEach(n => fkSet.add(n))
      }
    })
    if (fkSet.size < 2) return false
    const extra = model.fields.filter(f => {
      if (f.kind === 'object') return false
      if (f.isId) return false
      if (fkSet.has(f.name)) return false
      if (f.isUpdatedAt) return false
      if (f.name === 'createdAt' || f.name === 'updatedAt' || f.name === 'deletedAt') return false
      return true
    })
    return extra.length === 0
  }

  // GET /api/models
  app.get('/api/models', async (_req, res) => {
    try {
      const models = await Promise.all(
        dmmf.datamodel.models.map(async model => {
          let count = 0
          try { count = await getDelegate(model.name).count() } catch (_) {}
          return {
            name: model.name,
            count,
            isCompositeId: isCompositeId(model.name),
            isPivot: isPivotModel(model),
          }
        })
      )
      res.json(models)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // GET /api/models/:model/schema
  app.get('/api/models/:model/schema', (req, res) => {
    const modelDef = modelMap[req.params.model]
    if (!modelDef) return res.status(404).json({ error: 'Model not found' })
    res.json({
      name: req.params.model,
      fields: modelDef.fields.map(f => ({
        name: f.name,
        type: f.type,
        kind: f.kind,
        isRequired: f.isRequired,
        isList: f.isList,
        isId: f.isId,
        isUnique: f.isUnique,
        isReadOnly: f.isReadOnly,
        isGenerated: f.isGenerated,
        isUpdatedAt: f.isUpdatedAt,
        hasDefault: f.hasDefault,
        default: f.default,
        relationName: f.relationName ?? null,
        relationFromFields: f.relationFromFields ?? [],
        relationToFields: f.relationToFields ?? [],
        enumValues: f.kind === 'enum'
          ? (enumMap[f.type]?.values?.map(v => v.name) ?? [])
          : (enumAnnotations[f.name] ?? []),
      })),
    })
  })

  // GET /api/models/:model/records
  app.get('/api/models/:model/records', async (req, res) => {
    const { model } = req.params
    if (!modelMap[model]) return res.status(404).json({ error: 'Model not found' })

    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20))
    const skip = (page - 1) * pageSize
    const orderField = req.query.orderBy || getIdField(model)
    const orderDir = req.query.orderDir === 'desc' ? 'desc' : 'asc'
    const search = req.query.search?.trim() || ''
    const modelFields = modelMap[model].fields
    let where = {}

    if (search) {
      const strFields = modelFields.filter(f =>
        f.type === 'String'
        && f.kind === 'scalar'
        && !f.isList
        && !f.isReadOnly
        && f.nativeType?.[0] !== 'ObjectId'
      )
      if (strFields.length > 0) {
        where = { OR: strFields.map(f => ({ [f.name]: { contains: search, mode: 'insensitive' } })) }
      }
    }

    let filters = []
    try { if (req.query.filters) filters = JSON.parse(req.query.filters) } catch {}

    function buildOpClause(op, rawValue, fieldType) {
      let v = rawValue
      if (fieldType === 'Int') {
        v = parseInt(v, 10)
        if (Number.isNaN(v)) return null
      } else if (fieldType === 'Float' || fieldType === 'Decimal') {
        v = parseFloat(v)
        if (Number.isNaN(v)) return null
      } else if (fieldType === 'Boolean') {
        v = v === true || v === 'true'
      } else if (fieldType === 'DateTime') {
        const d = new Date(v); if (Number.isNaN(d.getTime())) return null
        v = d
      }
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

    function resolveTerminalField(rootModel, path) {
      let cur = modelMap[rootModel]
      for (let i = 0; i < path.length; i++) {
        if (!cur) return null
        const f = cur.fields.find(ff => ff.name === path[i])
        if (!f) return null
        if (i === path.length - 1) return f
        if (f.kind !== 'object') return null
        cur = modelMap[f.type]
      }
      return null
    }

    function buildPathClause(rootModel, path, opClause) {
      if (path.length === 0 || path.length > 3) return null
      const m = modelMap[rootModel]; if (!m) return null
      if (path.length === 1) {
        const f = m.fields.find(ff => ff.name === path[0])
        if (!f || f.kind === 'object') return null
        return { [path[0]]: opClause }
      }
      const head = m.fields.find(ff => ff.name === path[0])
      if (!head || head.kind !== 'object') return null
      const inner = buildPathClause(head.type, path.slice(1), opClause)
      if (!inner) return null
      return head.isList ? { [path[0]]: { some: inner } } : { [path[0]]: inner }
    }

    const filterClauses = []
    for (const f of filters) {
      if (!Array.isArray(f?.path) || f.path.length === 0) continue
      if (!f.op) continue
      if (f.value === undefined || f.value === '' || f.value === null) continue
      const term = resolveTerminalField(model, f.path)
      if (!term || term.kind === 'object') continue
      const opClause = buildOpClause(f.op, f.value, term.type)
      if (!opClause) continue
      const clause = buildPathClause(model, f.path, opClause)
      if (clause) filterClauses.push(clause)
    }
    if (filterClauses.length > 0) {
      const filterMode = req.query.filterMode === 'OR' ? 'OR' : 'AND'
      const filterGroup = filterClauses.length === 1
        ? filterClauses[0]
        : { [filterMode]: filterClauses }
      const baseHas = where && Object.keys(where).length > 0
      where = baseHas ? { AND: [where, filterGroup] } : filterGroup
    }

    // Build relation includes so the UI can show actual related data.
    //
    // For relations whose target is a pivot model we go one step further and
    // surface the pivot's other-side connection state, so the UI can warn when
    // a "jump-through" would land on a missing member (pivot row exists but
    // its other-side FK is null / unresolved).
    //  - Single rel → pivot: nest include with the pivot's other single rels.
    //  - List rel → pivot:   replace `_count` with actual rows but select only
    //                        the pivot's own FK columns (small payload).
    const singleRelFields = modelFields.filter(f => f.kind === 'object' && !f.isList)
    const listRelFields = modelFields.filter(f => f.kind === 'object' && f.isList)

    function pivotOtherSingleRels(pivotName) {
      const pm = modelMap[pivotName]
      if (!pm) return []
      return pm.fields.filter(ff =>
        ff.kind === 'object' && !ff.isList
        && Array.isArray(ff.relationFromFields) && ff.relationFromFields.length > 0
      )
    }

    const include = {}
    singleRelFields.forEach(f => {
      if (modelMap[f.type] && isPivotModel(modelMap[f.type])) {
        const nested = {}
        pivotOtherSingleRels(f.type).forEach(ff => {
          // Skip the side that points back to current model via the same relation
          if (ff.relationName === f.relationName) return
          nested[ff.name] = true
        })
        include[f.name] = Object.keys(nested).length > 0 ? { include: nested } : true
      } else {
        include[f.name] = true
      }
    })

    const pivotListFields = listRelFields.filter(f => modelMap[f.type] && isPivotModel(modelMap[f.type]))
    const nonPivotListFields = listRelFields.filter(f => !pivotListFields.includes(f))

    pivotListFields.forEach(f => {
      const pivotRels = pivotOtherSingleRels(f.type)
      const select = {}
      pivotRels.forEach(ff => {
        ff.relationFromFields.forEach(col => { select[col] = true })
      })
      // Always select the pivot's id field too so React keys are stable
      const pivotId = getIdField(f.type)
      if (pivotId) select[pivotId] = true
      include[f.name] = Object.keys(select).length > 0 ? { select } : true
    })

    if (nonPivotListFields.length > 0 || pivotListFields.length > 0) {
      // Keep `_count` so the UI's existing count badge stays accurate even
      // when we also include the pivot rows themselves.
      include._count = { select: Object.fromEntries(listRelFields.map(f => [f.name, true])) }
    }

    // Guard: cannot order by relation fields
    const orderFieldDef = modelFields.find(f => f.name === orderField)
    const safeOrderField = (!orderFieldDef || orderFieldDef.kind === 'object' || orderFieldDef.isList)
      ? getIdField(model)
      : orderField

    try {
      const delegate = getDelegate(model)
      const queryOptions = { skip, take: pageSize, orderBy: { [safeOrderField]: orderDir }, where }
      if (Object.keys(include).length > 0) queryOptions.include = include
      const [records, total] = await prisma.$transaction([
        delegate.findMany(queryOptions),
        delegate.count({ where }),
      ])
      res.json({ records, total, page, pageSize })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // POST /api/models/:model/records
  app.post('/api/models/:model/records', async (req, res) => {
    const { model } = req.params
    if (!modelMap[model]) return res.status(404).json({ error: 'Model not found' })
    try {
      const record = await getDelegate(model).create({ data: req.body })
      res.status(201).json(record)
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  // PATCH /api/models/:model/records/:id
  app.patch('/api/models/:model/records/:id', async (req, res) => {
    const { model, id } = req.params
    if (!modelMap[model]) return res.status(404).json({ error: 'Model not found' })
    const idField = getIdField(model)
    const idValue = isNaN(Number(id)) ? id : Number(id)
    try {
      const record = await getDelegate(model).update({ where: { [idField]: idValue }, data: req.body })
      res.json(record)
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  // Manual cascade delete: walk FK references across all models and delete
  // dependent records before deleting the target. Used when the schema
  // doesn't have ON DELETE CASCADE.
  async function cascadeDelete(modelName, idFieldName, idValue, visited = new Set()) {
    const key = `${modelName}#${String(idValue)}`
    if (visited.has(key)) return { deleted: 0 }
    visited.add(key)
    let totalDeleted = 0

    for (const m of dmmf.datamodel.models) {
      for (const f of m.fields) {
        if (f.kind !== 'object' || f.isList) continue
        if (f.type !== modelName) continue
        if (!f.relationFromFields?.length || !f.relationToFields?.length) continue
        if (f.relationToFields[0] !== idFieldName) continue
        const fk = f.relationFromFields[0]
        const depDelegate = getDelegate(m.name)
        const depIdField = getIdField(m.name)
        let deps = []
        try {
          deps = await depDelegate.findMany({ where: { [fk]: idValue } })
        } catch (err) { continue }
        for (const dep of deps) {
          const result = await cascadeDelete(m.name, depIdField, dep[depIdField], visited)
          totalDeleted += result.deleted
        }
      }
    }

    try {
      await getDelegate(modelName).delete({ where: { [idFieldName]: idValue } })
      totalDeleted += 1
    } catch (err) {
      // already deleted by an upstream cascade or never existed — ignore
    }
    return { deleted: totalDeleted }
  }

  // PATCH /api/models/:model/records (bulk update)
  app.patch('/api/models/:model/records', async (req, res) => {
    const { model } = req.params
    if (!modelMap[model]) return res.status(404).json({ error: 'Model not found' })
    const { ids, data } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' })
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'data object required' })
    }
    const idField = getIdField(model)
    try {
      const result = await getDelegate(model).updateMany({
        where: { [idField]: { in: ids.map(id => isNaN(Number(id)) ? id : Number(id)) } },
        data,
      })
      res.json({ updated: result.count })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  // DELETE /api/models/:model/records/:id?cascade=true
  app.delete('/api/models/:model/records/:id', async (req, res) => {
    const { model, id } = req.params
    if (!modelMap[model]) return res.status(404).json({ error: 'Model not found' })
    const idField = getIdField(model)
    const idValue = isNaN(Number(id)) ? id : Number(id)
    const cascade = req.query.cascade === 'true' || req.query.cascade === '1'
    try {
      if (cascade) {
        const r = await cascadeDelete(model, idField, idValue)
        return res.json({ success: true, cascade: true, deleted: r.deleted })
      }
      await getDelegate(model).delete({ where: { [idField]: idValue } })
      res.json({ success: true })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  // GET /api/stale-pivots?includeNull=true
  // Scans every pivot model for rows where one or more of the FK columns
  // points at a row that no longer exists in the referenced model. By default
  // null FK values are NOT considered stale (they're often deliberate). Pass
  // includeNull=true to also flag null FKs.
  app.get('/api/stale-pivots', async (req, res) => {
    const includeNull = req.query.includeNull === 'true' || req.query.includeNull === '1'
    const result = []
    try {
      for (const m of dmmf.datamodel.models) {
        if (!isPivotModel(m)) continue
        const pivotRels = m.fields.filter(f =>
          f.kind === 'object' && !f.isList
          && Array.isArray(f.relationFromFields) && f.relationFromFields.length > 0
        )
        if (pivotRels.length < 2) continue

        const idField = getIdField(m.name)
        // Select pivot id + every FK column.
        const select = { [idField]: true }
        pivotRels.forEach(r => r.relationFromFields.forEach(c => { select[c] = true }))

        let rows = []
        try { rows = await getDelegate(m.name).findMany({ select }) } catch { continue }

        const sides = pivotRels.map(r => ({
          relName: r.name,
          targetModel: r.type,
          fk: r.relationFromFields[0],
          toField: r.relationToFields?.[0] || getIdField(r.type) || 'id',
          isRequired: r.isRequired,
        }))

        // Cache existing values per (targetModel + toField) so we don't query
        // the same set of ids more than once.
        const existCache = new Map()
        async function existsIn(targetModel, toField, value) {
          if (value === null || value === undefined) return false
          const key = `${targetModel}|${toField}`
          let set = existCache.get(key)
          if (!set) {
            try {
              const all = await getDelegate(targetModel).findMany({ select: { [toField]: true } })
              set = new Set(all.map(r => String(r[toField])))
            } catch { set = new Set() }
            existCache.set(key, set)
          }
          return set.has(String(value))
        }

        const stale = []
        for (const row of rows) {
          const issues = []
          for (const side of sides) {
            const v = row[side.fk]
            if (v === null || v === undefined) {
              if (includeNull) issues.push({ ...side, reason: 'null', value: null })
              continue
            }
            const ok = await existsIn(side.targetModel, side.toField, v)
            if (!ok) issues.push({ ...side, reason: 'orphan', value: v })
          }
          if (issues.length > 0) {
            stale.push({ id: row[idField], idField, fkValues: row, issues })
          }
        }

        if (stale.length > 0) {
          result.push({
            pivotModel: m.name,
            idField,
            sides,
            stale,
          })
        }
      }
      res.json({ pivots: result })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Pivot view ─────────────────────────────────────────────────────────────
  // GET /api/pivot/:pivotModel?page=1&pageSize=20&search=...
  // Returns each pivot row with both connected entities fully included so the
  // UI can render a single "joined" big row containing both sides.
  app.get('/api/pivot/:pivotModel', async (req, res) => {
    const pivotName = req.params.pivotModel
    const pivot = modelMap[pivotName]
    if (!pivot) return res.status(404).json({ error: 'Pivot model not found' })

    const pivotRels = pivot.fields.filter(f =>
      f.kind === 'object' && !f.isList && Array.isArray(f.relationFromFields) && f.relationFromFields.length > 0
    )
    if (pivotRels.length < 2) {
      return res.status(400).json({ error: 'Pivot view requires at least 2 single FK relations' })
    }

    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20))
    const skip = (page - 1) * pageSize
    const search = (req.query.search || '').trim()

    const sides = pivotRels.map(rel => {
      const m = modelMap[rel.type]
      const idF = m?.fields.find(f => f.isId)
      const fields = (m?.fields || [])
        .map(f => ({
          name: f.name,
          type: f.type,
          kind: f.kind,
          isId: f.isId,
          isList: f.isList,
          isRequired: f.isRequired,
          isReadOnly: f.isReadOnly,
          isGenerated: f.isGenerated,
          isUpdatedAt: f.isUpdatedAt,
          hasDefault: f.hasDefault,
          default: f.default,
          relationName: f.relationName ?? null,
          relationFromFields: f.relationFromFields ?? [],
          relationToFields: f.relationToFields ?? [],
          enumValues: f.kind === 'enum'
            ? (enumMap[f.type]?.values?.map(v => v.name) ?? [])
            : (enumAnnotations[f.name] ?? []),
        }))
      return {
        model: rel.type,
        relName: rel.name,
        fk: rel.relationFromFields[0],
        toField: rel.relationToFields?.[0] || idF?.name || 'id',
        idField: idF?.name || 'id',
        fields,
      }
    })

    let where = {}
    if (search) {
      const orClauses = []
      pivotRels.forEach(r => {
        const m = modelMap[r.type]
        ;(m?.fields || []).forEach(f => {
          if (f.type === 'String' && f.kind === 'scalar' && !f.isList && !f.isReadOnly && f.nativeType?.[0] !== 'ObjectId') {
            orClauses.push({ [r.name]: { [f.name]: { contains: search, mode: 'insensitive' } } })
          }
        })
      })
      if (orClauses.length > 0) where = { OR: orClauses }
    }

    // For each side relation on the pivot, also include the side record's own
    // single relations (so the joined view can render relation cells) plus a
    // _count for any list relations on the side.
    const include = {}
    pivotRels.forEach(r => {
      const m = modelMap[r.type]
      if (!m) { include[r.name] = true; return }
      const nestedSingleRels = m.fields.filter(f => f.kind === 'object' && !f.isList)
      const nestedListRels = m.fields.filter(f => f.kind === 'object' && f.isList)
      const nested = {}
      nestedSingleRels.forEach(f => { nested[f.name] = true })
      if (nestedListRels.length > 0) {
        nested._count = { select: Object.fromEntries(nestedListRels.map(f => [f.name, true])) }
      }
      include[r.name] = Object.keys(nested).length > 0 ? { include: nested } : true
    })

    const pivotDelegate = getDelegate(pivotName)
    try {
      const [rows, total] = await prisma.$transaction([
        pivotDelegate.findMany({ skip, take: pageSize, where, include }),
        pivotDelegate.count({ where }),
      ])
      res.json({
        pivotModel: pivotName,
        sides,
        rows,
        total, page, pageSize,
      })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // POST /api/pivot/:pivotModel/sync
  // body: { primaryFk, secondaryFk, primaryId, addSecondaryIds: [], removeSecondaryIds: [] }
  app.post('/api/pivot/:pivotModel/sync', async (req, res) => {
    const pivotName = req.params.pivotModel
    if (!modelMap[pivotName]) return res.status(404).json({ error: 'Pivot model not found' })
    const { primaryFk, secondaryFk, primaryId, addSecondaryIds = [], removeSecondaryIds = [] } = req.body || {}
    if (!primaryFk || !secondaryFk || primaryId === undefined) {
      return res.status(400).json({ error: 'primaryFk, secondaryFk and primaryId required' })
    }
    const delegate = getDelegate(pivotName)
    try {
      const ops = []
      if (Array.isArray(removeSecondaryIds) && removeSecondaryIds.length > 0) {
        ops.push(delegate.deleteMany({
          where: { [primaryFk]: primaryId, [secondaryFk]: { in: removeSecondaryIds } },
        }))
      }
      if (Array.isArray(addSecondaryIds) && addSecondaryIds.length > 0) {
        ops.push(delegate.createMany({
          data: addSecondaryIds.map(sid => ({ [primaryFk]: primaryId, [secondaryFk]: sid })),
          skipDuplicates: true,
        }))
      }
      if (ops.length > 0) await prisma.$transaction(ops)
      res.json({ ok: true, added: addSecondaryIds.length, removed: removeSecondaryIds.length })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  // DELETE /api/models/:model/records (bulk)
  app.delete('/api/models/:model/records', async (req, res) => {
    const { model } = req.params
    if (!modelMap[model]) return res.status(404).json({ error: 'Model not found' })
    const { ids, cascade } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' })
    const idField = getIdField(model)
    try {
      if (cascade) {
        let total = 0
        const visited = new Set()
        for (const id of ids) {
          const idVal = isNaN(Number(id)) ? id : Number(id)
          const r = await cascadeDelete(model, idField, idVal, visited)
          total += r.deleted
        }
        return res.json({ deleted: total, cascade: true })
      }
      const result = await getDelegate(model).deleteMany({
        where: { [idField]: { in: ids.map(id => isNaN(Number(id)) ? id : Number(id)) } },
      })
      res.json({ deleted: result.count })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  return app
}
