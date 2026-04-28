import { useState, useRef, useEffect } from 'react'
import RelationPickerTable from './RelationPickerTable.jsx'

const ENUM_COLORS = {
  USER:      { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  ADMIN:     { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  MODERATOR: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  true:      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  false:     { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
}

function getEnumStyle(value) {
  return ENUM_COLORS[value] || { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' }
}

function formatDate(val) {
  if (!val) return null
  try {
    const d = new Date(val)
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return val }
}

function RelationArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  )
}

function CellDisplay({ field, value }) {
  // List relation — value is count from _count
  if (field.kind === 'object' && field.isList) {
    const count = typeof value === 'number' ? value : 0
    return (
      <span className="cell-list-count">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {count} {field.type}{count !== 1 ? 's' : ''}
      </span>
    )
  }

  // Single relation — value is the full related record object
  if (field.kind === 'object') {
    if (value === null || value === undefined) return <span className="cell-null">null</span>
    if (typeof value === 'object') {
      const displayVal = value.name || value.title || value.email || value.label || value.slug
        || (value.id !== undefined ? `#${value.id}` : '—')
      return (
        <span className="cell-relation" title={JSON.stringify(value)}>
          <RelationArrow /> {String(displayVal)}
        </span>
      )
    }
    return <span className="cell-relation"><RelationArrow /> {String(value)}</span>
  }

  if (value === null || value === undefined) {
    return <span className="cell-null">null</span>
  }

  if (field.isId) {
    return <span className="cell-id">{String(value)}</span>
  }

  // Scalar list (String[], Int[], etc.) — show actual values
  if (field.isList) {
    if (!Array.isArray(value) || value.length === 0) {
      return <span className="cell-null">[]</span>
    }
    const preview = value.slice(0, 4)
    const extra = value.length - preview.length
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', maxWidth: 360, overflow: 'hidden' }} title={value.join(', ')}>
        {preview.map((v, i) => (
          <span
            key={i}
            style={{
              background: 'var(--chip-bg)',
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 11,
              color: 'var(--chip-text)',
              fontFamily: typeof v === 'number' ? 'ui-monospace, monospace' : 'inherit',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {String(v)}
          </span>
        ))}
        {extra > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>+{extra}</span>
        )}
      </span>
    )
  }

  if (field.type === 'Boolean') {
    const s = getEnumStyle(String(value))
    return (
      <span className="enum-badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
        {value ? 'true' : 'false'}
      </span>
    )
  }

  if (field.kind === 'enum' || field.enumValues?.length > 0) {
    const s = getEnumStyle(value)
    return (
      <span className="enum-badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
        {value}
      </span>
    )
  }

  if (field.type === 'DateTime') {
    return <span className="cell-date">{formatDate(value)}</span>
  }

  if (field.type === 'Int' || field.type === 'Float' || field.type === 'Decimal') {
    return <span className="cell-number">{value}</span>
  }

  if (field.type === 'Json') {
    return (
      <span className="cell-string" style={{ color: '#059669', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
        {JSON.stringify(value).slice(0, 60)}
      </span>
    )
  }

  return <span className="cell-string" title={String(value)}>{String(value)}</span>
}

function CellEditor({ field, value, onSave, onCancel }) {
  const [val, setVal] = useState(() => {
    if (field.type === 'DateTime' && value) {
      try {
        return new Date(value).toISOString().slice(0, 16)
      } catch { return value || '' }
    }
    return value === null || value === undefined ? '' : String(value)
  })
  const inputRef = useRef(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    if (typeof el.select === 'function') el.select()
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) commit()
    if (e.key === 'Escape') onCancel()
  }

  function commit() {
    if (field.type === 'Int') onSave(val === '' ? null : parseInt(val, 10))
    else if (field.type === 'Float' || field.type === 'Decimal') onSave(val === '' ? null : parseFloat(val))
    else if (field.type === 'DateTime') onSave(val === '' ? null : new Date(val).toISOString())
    else onSave(val === '' ? null : val)
  }

  if (field.kind === 'enum' || field.enumValues?.length > 0) {
    const opts = field.enumValues || []
    return (
      <select
        ref={inputRef}
        className="cell-edit-select"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => onSave(val === '' ? null : val)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
      >
        {!field.isRequired && <option value="">null</option>}
        {opts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    )
  }

  if (field.type === 'DateTime') {
    return (
      <input
        ref={inputRef}
        type="datetime-local"
        className="cell-edit-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    )
  }

  return (
    <input
      ref={inputRef}
      type={field.type === 'Int' || field.type === 'Float' ? 'number' : 'text'}
      className="cell-edit-input"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}

function ListEditModal({ field, value, onSave, onClose }) {
  const initial = Array.isArray(value) ? [...value] : []
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function parseDraft() {
    const v = draft.trim()
    if (!v) return null
    if (field.type === 'Int') {
      const n = parseInt(v, 10)
      return Number.isNaN(n) ? null : n
    }
    if (field.type === 'Float' || field.type === 'Decimal') {
      const n = parseFloat(v)
      return Number.isNaN(n) ? null : n
    }
    return v
  }

  function add() {
    const v = parseDraft()
    if (v === null) return
    setItems(prev => [...prev, v])
    setDraft('')
  }

  function remove(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function move(idx, delta) {
    const j = idx + delta
    if (j < 0 || j >= items.length) return
    setItems(prev => {
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 150 }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit {field.name}</div>
            <div className="modal-subtitle">{field.type}[] · {items.length} item{items.length !== 1 ? 's' : ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {items.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>No items yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 13,
                    fontFamily: typeof it === 'number' ? 'ui-monospace, monospace' : 'inherit',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'ui-monospace, monospace', minWidth: 18 }}>{i}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(it)}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={iconBtnStyle} title="Move up">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} style={iconBtnStyle} title="Move down">↓</button>
                  <button type="button" onClick={() => remove(i)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Remove">×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              ref={inputRef}
              className="form-input"
              type={field.type === 'Int' || field.type === 'Float' ? 'number' : 'text'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="Add new item, press Enter"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-create" onClick={add} disabled={!draft.trim()} style={{ padding: '6px 14px' }}>Add</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-create" type="button" onClick={() => onSave(items)}>Save</button>
        </div>
      </div>
    </div>
  )
}

const iconBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: 13,
  padding: '2px 6px',
  borderRadius: 3,
}

function isEditable(field) {
  if (field.isId) return false
  if (field.isGenerated) return false
  if (field.isUpdatedAt) return false
  if (field.kind === 'object') return false      // handled via relation picker
  if (field.isList) return false                 // handled via list editor modal
  return true                                    // includes isReadOnly FK scalars
}

function getIdValue(record, idField) {
  return record[idField]
}

function ThroughIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/>
      <path d="M13 6l6 6-6 6"/>
      <circle cx="9" cy="12" r="1.6" fill="currentColor"/>
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

function PivotThroughMenu({ x, y, options, warnings, onPick, onClose }) {
  useEffect(() => {
    const close = () => onClose()
    const t = setTimeout(() => {
      document.addEventListener('mousedown', close)
      document.addEventListener('contextmenu', close)
    }, 0)
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('contextmenu', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const margin = 8
  const W = 220, H = options.length * 32 + 36
  const left = Math.min(x, window.innerWidth - W - margin)
  const top = Math.min(y, window.innerHeight - H - margin)
  return (
    <div
      className="context-menu"
      style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: '6px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Through pivot to
      </div>
      {options.map((opt, i) => {
        const w = warnings?.find(x => x.option === opt)?.missing
        return (
          <button
            key={i}
            type="button"
            className={`context-menu-item ${w ? 'is-warning' : ''}`}
            onClick={() => { onPick(opt); onClose() }}
            title={w ? `Some pivot rows have no linked ${opt.targetModel}` : undefined}
          >
            <span className="context-menu-icon">{w ? <WarningIcon /> : <ThroughIcon />}</span>
            <span>{opt.targetModel}</span>
            {w && <span className="context-menu-item-warning-tag">missing</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function DataTable({
  fields,
  records,
  idField,
  selectedRows,
  onToggleRow,
  onToggleAll,
  onUpdateCell,
  onDeleteRow,
  orderBy,
  orderDir,
  onSort,
  onNavigateRelation,
  models = [],
  schemaCache = {},
  ensureSchema,
  currentModelName,
  onNavigateThroughPivot,
}) {
  const [editingCell, setEditingCell] = useState(null)
  const [pickerCell, setPickerCell] = useState(null)   // { record, field } for single relations
  const [listCell, setListCell] = useState(null)       // { record, field } for scalar lists
  const [pivotMenu, setPivotMenu] = useState(null)     // { x, y, options, record }

  const pivotModelSet = new Set(models.filter(m => m.isPivot).map(m => m.name))

  // Resolve the "other sides" of a pivot relative to the current model + source
  // relation. We identify "my" rel on the pivot by matching the source field's
  // relationName — this is the only reliable disambiguation when the pivot is
  // self-referencing (both sides point at the same model, e.g. A ↔ A via AA).
  function getPivotOtherSides(sourceField) {
    const targetPivotName = sourceField?.type
    if (!targetPivotName || !pivotModelSet.has(targetPivotName)) return null
    const pivotSchema = schemaCache[targetPivotName]
    if (!pivotSchema) {
      ensureSchema?.(targetPivotName)
      return null
    }
    const pivotRels = pivotSchema.fields.filter(f =>
      f.kind === 'object' && !f.isList && Array.isArray(f.relationFromFields) && f.relationFromFields.length > 0
    )
    if (pivotRels.length < 2) return null
    const myRel =
      (sourceField.relationName && pivotRels.find(r => r.relationName === sourceField.relationName))
      || pivotRels.find(r => r.type === currentModelName)
    if (!myRel) return null
    return pivotRels
      .filter(r => r !== myRel)
      .map(r => ({
        targetModel: r.type,
        pivotName: targetPivotName,
        fkToCurrent: myRel.relationFromFields[0],
        currentToField: myRel.relationToFields?.[0] || idField || 'id',
        pivotRelToTargetRelationName: r.relationName,
        pivotOtherFieldName: r.name,
        pivotOtherFk: r.relationFromFields[0],
      }))
  }

  // Detect whether a through-jump from a record would yield no actual member
  // on the other side(s). For single-relation cells the pivot record is fully
  // included; for list-relation cells the pivot rows include only their FKs.
  // Returns null when we have no enriched data (so we render no warning), or
  // an array { option, missing } per other-side option.
  function getThroughWarnings(field, record, options) {
    if (!options || options.length === 0) return null
    if (field.kind !== 'object') return null
    const value = record[field.name]
    if (value === undefined || value === null) return null

    if (!field.isList) {
      // Single relation: pivot record itself, with its other-side single rels
      // nested. Missing means the nested object is null/undefined.
      const out = []
      for (const opt of options) {
        const sub = value[opt.pivotOtherFieldName]
        const missing = sub === null || sub === undefined
        out.push({ option: opt, missing })
      }
      return out
    }

    if (field.isList) {
      // List relation: pivot rows array with FK columns selected. Missing
      // means at least one pivot row has the other-side FK as null.
      if (!Array.isArray(value)) return null
      const out = []
      for (const opt of options) {
        const missing = value.some(row =>
          row && (row[opt.pivotOtherFk] === null || row[opt.pivotOtherFk] === undefined)
        )
        out.push({ option: opt, missing })
      }
      return out
    }
    return null
  }

  function handlePivotThroughClick(e, field, record) {
    e.stopPropagation()
    const others = getPivotOtherSides(field)
    if (!others || others.length === 0) return
    if (others.length === 1) {
      onNavigateThroughPivot?.(others[0], record)
    } else {
      const warnings = getThroughWarnings(field, record, others)
      setPivotMenu({ x: e.clientX, y: e.clientY, options: others, record, warnings })
    }
  }

  const allSelected = records.length > 0 && records.every(r => selectedRows.has(String(getIdValue(r, idField))))
  const someSelected = records.some(r => selectedRows.has(String(getIdValue(r, idField))))

  async function handleSave(record, field, newVal) {
    setEditingCell(null)
    const currentVal = record[field.name]
    if (newVal === currentVal) return
    if (newVal === '' && currentVal === null) return
    await onUpdateCell(getIdValue(record, idField), field.name, newVal)
  }

  function handleBoolToggle(record, field) {
    onUpdateCell(getIdValue(record, idField), field.name, !record[field.name])
  }

  async function handlePickRelation(picked) {
    if (!pickerCell) return
    const { record, field } = pickerCell
    const fkField = field.relationFromFields?.[0]
    const toField = field.relationToFields?.[0] || 'id'
    if (!fkField) { setPickerCell(null); return }
    const newVal = picked[toField]
    setPickerCell(null)
    await onUpdateCell(getIdValue(record, idField), fkField, newVal)
  }

  async function handleSaveList(items) {
    if (!listCell) return
    const { record, field } = listCell
    setListCell(null)
    await onUpdateCell(getIdValue(record, idField), field.name, items)
  }

  return (
    <>
    <table className="data-table">
      <thead>
        <tr>
          <th className="td-center">
            <div className="th-inner th-center" style={{ cursor: 'default' }}>
              <input
                type="checkbox"
                className="checkbox"
                checked={allSelected}
                ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                onChange={onToggleAll}
              />
            </div>
          </th>
          {fields.map(field => (
            <th key={field.name}>
              <div
                className={`th-inner ${orderBy === field.name ? 'sorted' : ''}`}
                onClick={() => !field.isList && !field.relationName && onSort(field.name)}
                style={{ cursor: field.isList || field.relationName ? 'default' : 'pointer' }}
              >
                <span>{field.name}</span>
                <span className="th-type-badge">
                  {field.kind === 'enum' ? field.type
                    : field.kind === 'object' ? field.type
                    : field.type.toLowerCase()}
                  {field.isList ? '[]' : ''}
                </span>
                {orderBy === field.name && (
                  <span className="sort-arrow">{orderDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>
            </th>
          ))}
          <th style={{ width: 44 }} />
        </tr>
      </thead>
      <tbody>
        {records.map(record => {
          const id = String(getIdValue(record, idField))
          const isSelected = selectedRows.has(id)
          return (
            <tr key={id} className={isSelected ? 'selected' : ''}>
              <td className="td-center">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleRow(id)}
                />
              </td>
              {fields.map(field => {
                const cellKey = `${id}-${field.name}`
                const isEditing = editingCell === cellKey
                const editable = isEditable(field)

                const value = (field.kind === 'object' && field.isList)
                  ? (record._count?.[field.name] ?? 0)
                  : record[field.name]

                const isSingleRelation = field.kind === 'object' && !field.isList && (field.relationFromFields?.length > 0)
                const isScalarList = field.kind === 'scalar' && field.isList && !field.isGenerated && !field.isId
                const hasNavTarget = field.kind === 'object' && (
                  (field.isList && (record._count?.[field.name] ?? 0) > 0) ||
                  (!field.isList && record[field.name] !== null && record[field.name] !== undefined)
                )

                return (
                  <td key={field.name}>
                    {isEditing ? (
                      <div className="cell" style={{ padding: '0 8px' }}>
                        <CellEditor
                          field={field}
                          value={record[field.name]}
                          onSave={val => handleSave(record, field, val)}
                          onCancel={() => setEditingCell(null)}
                        />
                      </div>
                    ) : field.type === 'Boolean' && editable ? (
                      <div className="cell readonly">
                        <button
                          className={`bool-toggle ${value ? 'on' : 'off'}`}
                          onClick={() => handleBoolToggle(record, field)}
                          title={`Click to set ${!value}`}
                        >
                          <div className="bool-toggle-thumb" />
                        </button>
                      </div>
                    ) : isScalarList ? (
                      <div
                        className="cell relation-link"
                        onClick={() => setListCell({ record, field })}
                        title="Click to edit list"
                        style={{ cursor: 'pointer' }}
                      >
                        <CellDisplay field={field} value={value} />
                      </div>
                    ) : isSingleRelation ? (() => {
                      const targetIsPivot = pivotModelSet.has(field.type)
                      const throughOpts = targetIsPivot && hasNavTarget ? getPivotOtherSides(field) : null
                      const throughWarnings = throughOpts ? getThroughWarnings(field, record, throughOpts) : null
                      const anyMissing = throughWarnings?.some(w => w.missing)
                      return (
                        <div
                          className={`cell ${hasNavTarget ? 'relation-link' : ''}`}
                          onClick={hasNavTarget ? () => onNavigateRelation?.(field, record) : () => setPickerCell({ record, field })}
                          title={hasNavTarget ? `Open related ${field.type} (use ✎ to change)` : `Pick a ${field.type}`}
                          style={{ cursor: 'pointer' }}
                        >
                          <span className="cell-relation-group">
                            <CellDisplay field={field} value={value} />
                            {targetIsPivot && hasNavTarget && (
                              <button
                                type="button"
                                className={`cell-pivot-through-btn ${anyMissing ? 'is-warning' : ''}`}
                                onClick={e => handlePivotThroughClick(e, field, record)}
                                title={anyMissing
                                  ? `Jump through ${field.type} pivot — linked record is missing`
                                  : `Jump through ${field.type} pivot`}
                              >
                                {anyMissing ? <WarningIcon /> : <ThroughIcon />}
                              </button>
                            )}
                          </span>
                          <button
                            type="button"
                            className="cell-edit-btn"
                            onClick={e => { e.stopPropagation(); setPickerCell({ record, field }) }}
                            title={`Change ${field.name}`}
                          >
                            <PencilIcon />
                          </button>
                        </div>
                      )
                    })() : (() => {
                      const clickable = editable || hasNavTarget
                      const handleClick = editable
                        ? () => setEditingCell(cellKey)
                        : hasNavTarget
                          ? () => onNavigateRelation?.(field, record)
                          : undefined
                      const isObjectList = field.kind === 'object' && field.isList
                      const targetIsPivot = isObjectList && pivotModelSet.has(field.type) && hasNavTarget
                      const throughOpts = targetIsPivot ? getPivotOtherSides(field) : null
                      const throughWarnings = throughOpts ? getThroughWarnings(field, record, throughOpts) : null
                      const anyMissing = throughWarnings?.some(w => w.missing)
                      return (
                        <div
                          className={`cell ${clickable ? '' : 'readonly'} ${hasNavTarget ? 'relation-link' : ''}`}
                          onClick={handleClick}
                          title={editable ? 'Click to edit' : hasNavTarget ? `Open related ${field.type}` : undefined}
                          style={hasNavTarget ? { cursor: 'pointer' } : undefined}
                        >
                          <span className="cell-relation-group">
                            <CellDisplay field={field} value={value} />
                            {targetIsPivot && (
                              <button
                                type="button"
                                className={`cell-pivot-through-btn ${anyMissing ? 'is-warning' : ''}`}
                                onClick={e => handlePivotThroughClick(e, field, record)}
                                title={anyMissing
                                  ? `Jump through ${field.type} pivot — some rows have no linked member`
                                  : `Jump through ${field.type} pivot`}
                              >
                                {anyMissing ? <WarningIcon /> : <ThroughIcon />}
                              </button>
                            )}
                          </span>
                        </div>
                      )
                    })()}
                  </td>
                )
              })}
              <td className="td-center">
                <button
                  title="Delete row"
                  onClick={() => onDeleteRow(getIdValue(record, idField))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#D1D1D6',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#FF3B30'}
                  onMouseLeave={e => e.currentTarget.style.color = '#D1D1D6'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>

    {pickerCell && (
      <RelationPickerTable
        modelName={pickerCell.field.type}
        valueField={pickerCell.field.relationToFields?.[0] || 'id'}
        onPick={handlePickRelation}
        onClose={() => setPickerCell(null)}
      />
    )}

    {listCell && (
      <ListEditModal
        field={listCell.field}
        value={listCell.record[listCell.field.name]}
        onSave={handleSaveList}
        onClose={() => setListCell(null)}
      />
    )}

    {pivotMenu && (
      <PivotThroughMenu
        x={pivotMenu.x}
        y={pivotMenu.y}
        options={pivotMenu.options}
        warnings={pivotMenu.warnings}
        onPick={opt => onNavigateThroughPivot?.(opt, pivotMenu.record)}
        onClose={() => setPivotMenu(null)}
      />
    )}
    </>
  )
}
