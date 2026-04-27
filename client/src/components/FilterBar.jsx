import { useEffect } from 'react'

const STRING_OPS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'not', label: 'not equals' },
]
const NUMBER_OPS = [
  { value: 'equals', label: '=' },
  { value: 'not', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
]
const BOOL_OPS = [{ value: 'equals', label: 'equals' }]
const ENUM_OPS = [
  { value: 'equals', label: 'equals' },
  { value: 'not', label: 'not equals' },
]

const MAX_DEPTH = 3

function getOpsForField(field) {
  if (!field) return STRING_OPS
  if (field.kind === 'enum' || field.enumValues?.length > 0) return ENUM_OPS
  if (field.type === 'Boolean') return BOOL_OPS
  if (field.type === 'Int' || field.type === 'Float' || field.type === 'Decimal' || field.type === 'DateTime') return NUMBER_OPS
  return STRING_OPS
}

function defaultValueForField(field) {
  if (!field) return ''
  if (field.type === 'Boolean') return 'true'
  return ''
}

function FilterRow({ baseSchema, filter, onChange, onRemove, schemaCache, ensureSchema }) {
  const path = filter.path || []

  // Build segments: schema available at each level. segments[i] is the schema
  // from which field at path[i] is chosen. segments.length is always
  // path.length + 1 (the trailing entry is the next selector to fill).
  const segments = [{ schema: baseSchema, parentField: null }]
  for (let i = 0; i < path.length; i++) {
    const seg = segments[i]
    const field = seg.schema?.fields.find(f => f.name === path[i])
    if (!field || field.kind !== 'object') break
    if (i + 1 >= MAX_DEPTH) break
    const next = schemaCache[field.type]
    if (!next) break
    segments.push({ schema: next, parentField: field })
  }

  // Lazily fetch schemas needed for the current path
  useEffect(() => {
    let cur = baseSchema
    for (let i = 0; i < path.length; i++) {
      const f = cur?.fields.find(ff => ff.name === path[i])
      if (!f || f.kind !== 'object') break
      if (!schemaCache[f.type]) {
        ensureSchema(f.type)
        break
      }
      cur = schemaCache[f.type]
    }
  }, [path.join('\0'), schemaCache, baseSchema])

  // Resolve terminal field (the actual scalar/enum we filter on)
  let terminalField = null
  if (path.length > 0) {
    const lastIdx = path.length - 1
    const seg = segments[lastIdx]
    const f = seg?.schema?.fields.find(ff => ff.name === path[lastIdx])
    if (f && f.kind !== 'object') terminalField = f
  }

  function setSegment(level, fieldName) {
    if (!fieldName) {
      onChange({ ...filter, path: path.slice(0, level), value: '' })
      return
    }
    const seg = segments[level]
    const field = seg?.schema?.fields.find(f => f.name === fieldName)
    const newPath = [...path.slice(0, level), fieldName]
    let newValue = ''
    let newOp = filter.op
    if (field && field.kind !== 'object') {
      newValue = defaultValueForField(field)
      const ops = getOpsForField(field)
      if (!ops.some(o => o.value === newOp)) newOp = ops[0].value
    } else if (field && field.kind === 'object') {
      // ensure target schema is loaded so the next selector renders
      ensureSchema(field.type)
    }
    onChange({ ...filter, path: newPath, op: newOp, value: newValue })
  }

  const ops = getOpsForField(terminalField)

  function renderValueInput() {
    if (!terminalField) return null
    const f = terminalField
    if (f.type === 'Boolean') {
      return (
        <select
          value={String(filter.value ?? 'true')}
          onChange={e => onChange({ ...filter, value: e.target.value })}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    }
    if (f.kind === 'enum' || f.enumValues?.length > 0) {
      return (
        <select
          value={filter.value || ''}
          onChange={e => onChange({ ...filter, value: e.target.value })}
        >
          <option value="">— pick —</option>
          {(f.enumValues || []).map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        type={f.type === 'Int' || f.type === 'Float' ? 'number' : f.type === 'DateTime' ? 'datetime-local' : 'text'}
        placeholder="value…"
        value={filter.value || ''}
        onChange={e => onChange({ ...filter, value: e.target.value })}
        style={{ width: 180 }}
      />
    )
  }

  return (
    <div className="filter-row">
      {segments.map((seg, i) => {
        if (!seg.schema) {
          return <span key={i} className="filter-loading">loading…</span>
        }
        const allowRelations = i < MAX_DEPTH - 1
        const opts = (seg.schema.fields || []).filter(f => {
          if (f.isList && f.kind !== 'object') return false
          if (f.kind === 'object') return allowRelations
          return true
        })
        const sorted = [...opts].sort((a, b) => {
          const ar = a.kind === 'object' ? 1 : 0
          const br = b.kind === 'object' ? 1 : 0
          if (ar !== br) return ar - br
          return a.name.localeCompare(b.name)
        })
        const selected = path[i] || ''
        return (
          <select
            key={i}
            value={selected}
            onChange={e => setSegment(i, e.target.value)}
            style={{ minWidth: 130 }}
          >
            <option value="">— {i === 0 ? 'field' : 'sub-field'} —</option>
            {sorted.map(f => (
              <option key={f.name} value={f.name}>
                {f.name}{f.kind === 'object' ? (f.isList ? ' ▸[]' : ' ▸') : ''}
              </option>
            ))}
          </select>
        )
      })}

      {terminalField && (
        <>
          <select
            value={filter.op || ops[0].value}
            onChange={e => onChange({ ...filter, op: e.target.value })}
          >
            {ops.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {renderValueInput()}
        </>
      )}

      <button
        type="button"
        className="filter-row-remove"
        onClick={onRemove}
        title="Remove filter"
      >×</button>
    </div>
  )
}

export default function FilterBar({ baseSchema, filters, filterMode = 'AND', onChange, onModeChange, onClear, onExport, schemaCache, ensureSchema }) {
  function addFilter() {
    onChange([...(filters || []), { path: [], op: 'contains', value: '' }])
  }

  function updateAt(i, newF) {
    onChange(filters.map((f, idx) => idx === i ? newF : f))
  }

  function removeAt(i) {
    onChange(filters.filter((_, idx) => idx !== i))
  }

  return (
    <div className="filter-bar-wrap">
      <div className="filter-bar-header">
        <span className="filter-bar-label">WHERE</span>
        <button type="button" className="filter-add-btn" onClick={addFilter}>
          + Add filter
        </button>
        {filters.length > 1 && (
          <div className="filter-mode-toggle" role="group" aria-label="Match mode">
            <button
              type="button"
              className={filterMode === 'AND' ? 'active' : ''}
              onClick={() => onModeChange?.('AND')}
              title="All conditions must match"
            >AND</button>
            <button
              type="button"
              className={filterMode === 'OR' ? 'active' : ''}
              onClick={() => onModeChange?.('OR')}
              title="At least one condition must match"
            >OR</button>
          </div>
        )}
        {filters.length > 1 && (
          <span className="filter-bar-and">
            ({filterMode === 'OR' ? 'any condition matches' : 'all conditions must match'})
          </span>
        )}
        <span style={{ flex: 1 }} />
        {onExport && (
          <button
            type="button"
            className="filter-export-btn"
            onClick={onExport}
            title="Show this filter as Prisma source code"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            Export as query
          </button>
        )}
        {filters.length > 0 && (
          <button type="button" className="filter-clear-btn" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      {filters.length === 0 ? (
        <div className="filter-bar-empty">
          No filters yet · click <strong>+ Add filter</strong> to start.
        </div>
      ) : (
        <div className="filter-rows">
          {filters.map((f, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="filter-mode-sep">
                  <span className={`filter-mode-pill ${filterMode === 'OR' ? 'or' : 'and'}`}>
                    {filterMode}
                  </span>
                </div>
              )}
              <FilterRow
                baseSchema={baseSchema}
                filter={f}
                onChange={nf => updateAt(i, nf)}
                onRemove={() => removeAt(i)}
                schemaCache={schemaCache}
                ensureSchema={ensureSchema}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
