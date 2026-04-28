import { Fragment, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import RelationPickerTable from './RelationPickerTable.jsx'

// Cycle through accent colors for each side of the pivot.
const SIDE_PALETTE = [
  { hex: '#5856D6', cellBg: 'rgba(88,86,214,0.04)', headerBg: 'rgba(88,86,214,0.10)' },
  { hex: '#0A84FF', cellBg: 'rgba(10,132,255,0.04)', headerBg: 'rgba(10,132,255,0.10)' },
  { hex: '#34C759', cellBg: 'rgba(52,199,89,0.05)', headerBg: 'rgba(52,199,89,0.12)' },
  { hex: '#FF9500', cellBg: 'rgba(255,149,0,0.05)', headerBg: 'rgba(255,149,0,0.14)' },
  { hex: '#FF2D92', cellBg: 'rgba(255,45,146,0.05)', headerBg: 'rgba(255,45,146,0.12)' },
  { hex: '#5AC8FA', cellBg: 'rgba(90,200,250,0.05)', headerBg: 'rgba(90,200,250,0.14)' },
]
function sidePalette(idx) { return SIDE_PALETTE[idx % SIDE_PALETTE.length] }
function sideCellBg(idx) { return sidePalette(idx).cellBg }
function sideHeaderBg(idx) { return sidePalette(idx).headerBg }
function sideHeaderColor(idx) { return sidePalette(idx).hex }

function formatDate(val) {
  if (!val) return ''
  try {
    return new Date(val).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return String(val) }
}

function displayValue(val, field) {
  if (val === null || val === undefined) return null
  if (Array.isArray(val)) return val.length === 0 ? '[]' : val.join(', ')
  if (field.type === 'Boolean') return val ? 'true' : 'false'
  if (field.type === 'DateTime') return formatDate(val)
  if (field.type === 'Json') return JSON.stringify(val)
  return String(val)
}

function isEditable(field) {
  if (field.isId) return false
  if (field.isGenerated) return false
  if (field.isUpdatedAt) return false
  return true
}

function relatedLabel(v) {
  if (!v || typeof v !== 'object') return null
  return v.name || v.title || v.email || v.label || v.slug
    || (v.id !== undefined ? `#${v.id}` : null)
}

function EditableCell({ record, field, modelName, onUpdated, onError, onRefetch }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef(null)
  const editable = !!record && isEditable(field)

  // Relation field rendering
  if (field.kind === 'object') {
    if (field.isList) {
      const count = record?._count?.[field.name] ?? 0
      return (
        <div className="pivot-cell readonly">
          <span className="cell-list-count">
            {count} {field.type}{count !== 1 ? 's' : ''}
          </span>
        </div>
      )
    }
    const related = record?.[field.name]
    const label = relatedLabel(related)
    const fkName = field.relationFromFields?.[0]
    const toField = field.relationToFields?.[0] || 'id'
    const canEdit = !!record && !!fkName
    return (
      <>
        <div
          className={`pivot-cell ${canEdit ? 'editable' : 'readonly'}`}
          onClick={canEdit ? () => setPickerOpen(true) : undefined}
          title={canEdit ? `Change ${field.name}` : undefined}
        >
          {related
            ? <span className="cell-relation">→ {label || `#${related[toField]}`}</span>
            : <span className="cell-null">null</span>}
        </div>
        {pickerOpen && (
          <RelationPickerTable
            modelName={field.type}
            valueField={toField}
            onClose={() => setPickerOpen(false)}
            onPick={async picked => {
              setPickerOpen(false)
              const newId = picked.__raw ? picked[toField] : picked[toField]
              try {
                const idField = field.idFieldOnSide || 'id'
                await api.updateRecord(modelName, record[idField], { [fkName]: newId })
                onRefetch?.()
              } catch (err) {
                onError?.('Update failed: ' + err.message)
              }
            }}
          />
        )}
      </>
    )
  }

  const display = displayValue(record?.[field.name], field)

  useEffect(() => {
    if (editing) {
      const el = inputRef.current
      if (!el) return
      el.focus()
      if (typeof el.select === 'function') el.select()
    }
  }, [editing])

  function startEdit() {
    if (!editable) return
    const v = record[field.name]
    if (field.type === 'DateTime' && v) {
      try { setVal(new Date(v).toISOString().slice(0, 16)) } catch { setVal('') }
    } else {
      setVal(v === null || v === undefined ? '' : String(v))
    }
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    let newVal
    if (val === '') {
      if (field.isRequired) return
      newVal = null
    } else if (field.type === 'Int') newVal = parseInt(val, 10)
    else if (field.type === 'Float' || field.type === 'Decimal') newVal = parseFloat(val)
    else if (field.type === 'DateTime') newVal = new Date(val).toISOString()
    else if (field.type === 'Boolean') newVal = val === 'true' || val === true
    else newVal = val
    const cur = record[field.name]
    if (newVal === cur) return
    try {
      const idField = field.idFieldOnSide || 'id'
      const updated = await api.updateRecord(modelName, record[idField], { [field.name]: newVal })
      onUpdated?.(updated)
    } catch (err) {
      onError?.('Update failed: ' + err.message)
    }
  }

  if (editing) {
    if (field.kind === 'enum' || field.enumValues?.length > 0) {
      return (
        <select
          ref={inputRef}
          className="cell-edit-select"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={() => { setEditing(false); commitEnumNullCheck() }}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        >
          {!field.isRequired && <option value="">null</option>}
          {(field.enumValues || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )
    }
    if (field.type === 'Boolean') {
      return (
        <select
          ref={inputRef}
          className="cell-edit-select"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    }
    return (
      <input
        ref={inputRef}
        type={field.type === 'Int' || field.type === 'Float' ? 'number' : field.type === 'DateTime' ? 'datetime-local' : 'text'}
        className="cell-edit-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
    function commitEnumNullCheck() {
      const v = val === '' ? null : val
      const cur = record[field.name]
      if (v === cur) return
      const idField = field.idFieldOnSide || 'id'
      api.updateRecord(modelName, record[idField], { [field.name]: v })
        .then(updated => onUpdated?.(updated))
        .catch(err => onError?.('Update failed: ' + err.message))
    }
  }

  return (
    <div
      className={`pivot-cell ${editable ? 'editable' : 'readonly'}`}
      onClick={editable ? startEdit : undefined}
      title={editable ? 'Click to edit' : undefined}
    >
      {display === null
        ? <span className="cell-null">null</span>
        : <span className="pivot-cell-value">{display}</span>}
    </div>
  )
}

const LABEL_FIELDS = [
  'name', 'displayName', 'fullName', 'firstName',
  'title', 'label', 'slug', 'username', 'handle',
  'companyName', 'businessName', 'email',
]
function recordLabel(r) {
  if (!r) return null
  for (const k of LABEL_FIELDS) {
    if (r[k] !== undefined && r[k] !== null && r[k] !== '') return String(r[k])
  }
  return null
}

export default function PivotView({ pivotModel, mode = 'joined', onToast, viewLayout = 'table', docLabelWidth = 180, onSetDocLabelWidth }) {
  const [expandedRow, setExpandedRow] = useState(null)
  useEffect(() => {
    if (expandedRow === null) return
    function onKey(e) { if (e.key === 'Escape') setExpandedRow(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedRow])
  function startLabelResize(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = docLabelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function onMove(ev) {
      const next = Math.max(80, Math.min(600, startW + (ev.clientX - startX)))
      onSetDocLabelWidth?.(next)
    }
    function onUp() {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const searchTimer = useRef(null)

  async function load(opts = {}) {
    setLoading(true)
    try {
      const d = await api.getPivotView(pivotModel, {
        page: opts.page ?? page,
        pageSize: opts.pageSize ?? pageSize,
        search: opts.search ?? search,
      })
      setData(d)
    } catch (err) {
      onToast?.('Failed to load pivot view: ' + err.message)
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    setData(null)
    setPage(1)
    load({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotModel])

  useEffect(() => { if (data) load() /* eslint-disable-next-line */ }, [page, pageSize])

  function handleSearchChange(v) {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); load({ page: 1, search: v }) }, 300)
  }

  function handleSideRecordUpdated(sideIdx, updated) {
    if (!data) return
    const side = data.sides[sideIdx]
    const idF = side.idField
    const id = updated[idF]
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => {
        const inner = row[side.relName]
        if (!inner || inner[idF] !== id) return row
        return { ...row, [side.relName]: { ...inner, ...updated } }
      }),
    }))
  }

  if (loading && !data) {
    return (
      <div className="pivot-view">
        <div className="loading-spinner"><div className="spinner"/> Loading pivot view…</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="pivot-view">
        <div className="pivot-view-empty"><p>No data.</p></div>
      </div>
    )
  }

  const sides = data.sides
  const total = data.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="pivot-view">
      <div className="pivot-view-toolbar">
        <span className="pivot-view-title">
          <strong>{pivotModel}</strong> joined view ·
          <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
            {sides.map(s => s.model).join(' ↔ ')}
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <div className="pivot-view-search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            placeholder="Search both sides…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="pivot-view-body">
        {data.rows.length === 0 ? (
          <div className="pivot-view-empty"><p>No connections to show.</p></div>
        ) : mode === 'joined' && viewLayout === 'document' ? (
          <div className={`doc-list pivot-doc-list ${expandedRow !== null ? 'has-expanded' : ''}`} style={{ '--doc-label-width': docLabelWidth + 'px' }}>
            {expandedRow !== null && (
              <div className="pivot-doc-backdrop" onClick={() => setExpandedRow(null)} />
            )}
            {data.rows.map((row, i) => (
              <div className={`doc-card pivot-doc-card ${expandedRow === i ? 'is-expanded' : ''}`} key={i}>
                <div className="pivot-doc-card-toolbar">
                  <button
                    type="button"
                    className="pivot-doc-expand-btn"
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    title={expandedRow === i ? 'Collapse' : 'Expand to fullscreen'}
                  >
                    {expandedRow === i ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 14h6v6"/><path d="M20 10h-6V4"/>
                        <path d="M14 10l7-7"/><path d="M3 21l7-7"/>
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6"/><path d="M9 21H3v-6"/>
                        <path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
                      </svg>
                    )}
                  </button>
                </div>
                <div className="pivot-doc-sides">
                {sides.map((side, sIdx) => {
                  const rec = row[side.relName]
                  const palette = sidePalette(sIdx)
                  const sideId = rec ? rec[side.idField] : null
                  const label = recordLabel(rec)
                  return (
                    <Fragment key={sIdx}>
                    {sIdx > 0 && (
                      <div className="pivot-doc-link" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12h18"/><path d="M7 6l-4 6 4 6"/><path d="M17 6l4 6-4 6"/>
                        </svg>
                      </div>
                    )}
                    <div
                      className="pivot-doc-side"
                      style={{ borderTop: `3px solid ${palette.hex}` }}
                    >
                      <div
                        className="pivot-doc-side-head"
                        style={{ background: palette.headerBg, color: palette.hex }}
                      >
                        <span className="pivot-doc-side-model">{side.model}</span>
                        {sideId !== null && sideId !== undefined && (
                          <span className="pivot-doc-side-id">#{String(sideId)}</span>
                        )}
                        {label && <span className="pivot-doc-side-label">{label}</span>}
                      </div>
                      <div className="doc-card-body">
                        {side.fields.filter(f => !f.isId).map(f => (
                          <div key={f.name} className="doc-row">
                            <span className="doc-row-label" title={f.type + (f.isList ? '[]' : '')}>
                              {f.name}
                              {onSetDocLabelWidth && (
                                <span
                                  className="doc-row-label-resizer"
                                  onMouseDown={startLabelResize}
                                  title="Drag to resize"
                                />
                              )}
                            </span>
                            <span className="doc-row-value">
                              <EditableCell
                                record={rec}
                                field={{ ...f, idFieldOnSide: side.idField }}
                                modelName={side.model}
                                onUpdated={updated => handleSideRecordUpdated(sIdx, updated)}
                                onError={onToast}
                                onRefetch={load}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    </Fragment>
                  )
                })}
                </div>
              </div>
            ))}
          </div>
        ) : mode === 'cards' ? (
          <div className="pivot-cards">
            {data.rows.map((row, i) => (
              <div className="pivot-card" key={i}>
                {sides.map((side, sIdx) => {
                  const rec = row[side.relName]
                  const label = recordLabel(rec)
                  const sideId = rec ? rec[side.idField] : null
                  const palette = sidePalette(sIdx)
                  return (
                    <Fragment key={sIdx}>
                      {sIdx > 0 && (
                        <div className="pivot-card-link" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12h18"/>
                            <path d="M7 6l-4 6 4 6"/>
                            <path d="M17 6l4 6-4 6"/>
                          </svg>
                        </div>
                      )}
                      <div className="pivot-card-side" style={{ borderColor: palette.hex, background: palette.cellBg }}>
                        <div className="pivot-card-head" style={{ color: palette.hex }}>
                          <span className="pivot-card-model">{side.model}</span>
                          {sideId !== null && sideId !== undefined && (
                            <span className="pivot-card-id">#{String(sideId)}</span>
                          )}
                        </div>
                        <div className="pivot-card-label">
                          {label || <span className="cell-null">— no label —</span>}
                        </div>
                        <div className="pivot-card-fields">
                          {side.fields
                            .filter(f => !f.isId && f.kind !== 'object')
                            .slice(0, 6)
                            .map(f => (
                              <div className="pivot-card-field" key={f.name}>
                                <span className="pivot-card-field-name">{f.name}</span>
                                <span className="pivot-card-field-value">
                                  <EditableCell
                                    record={rec}
                                    field={{ ...f, idFieldOnSide: side.idField }}
                                    modelName={side.model}
                                    onUpdated={updated => handleSideRecordUpdated(sIdx, updated)}
                                    onError={onToast}
                                    onRefetch={load}
                                  />
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </Fragment>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <table className="pivot-pair-table">
            <thead>
              <tr className="pivot-pair-side-headers">
                {sides.map((side, sIdx) => (
                  <Fragment key={`hg-${sIdx}`}>
                    {sIdx > 0 && <th className="pivot-divider-col" />}
                    <th
                      colSpan={side.fields.length}
                      className="pivot-side-group"
                      style={{ background: sideHeaderBg(sIdx), color: sideHeaderColor(sIdx) }}
                    >{side.model}</th>
                  </Fragment>
                ))}
              </tr>
              <tr>
                {sides.map((side, sIdx) => (
                  <Fragment key={`fh-${sIdx}`}>
                    {sIdx > 0 && <th className="pivot-divider-col" />}
                    {side.fields.map(f => (
                      <th key={`${sIdx}-${f.name}`} className="pivot-field-th">
                        {f.name}
                        <span className="pivot-field-type">{f.type}</span>
                      </th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i}>
                  {sides.map((side, sIdx) => {
                    const rec = row[side.relName]
                    return (
                      <Fragment key={`r-${i}-${sIdx}`}>
                        {sIdx > 0 && <td className="pivot-divider-col" />}
                        {side.fields.map(f => (
                          <td
                            key={`${i}-${sIdx}-${f.name}`}
                            className="pivot-pair-cell"
                            style={{ background: sideCellBg(sIdx) }}
                          >
                            <EditableCell
                              record={rec}
                              field={{ ...f, idFieldOnSide: side.idField }}
                              modelName={side.model}
                              onUpdated={updated => handleSideRecordUpdated(sIdx, updated)}
                              onError={onToast}
                              onRefetch={load}
                            />
                          </td>
                        ))}
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <span className="pagination-info">
          {total === 0 ? 'No connections' : <>Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</strong> of <strong>{total}</strong></>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rows per page</span>
        <select className="page-size-select" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="pagination-pages">
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page} / {totalPages}</span>
          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      </div>
    </div>
  )
}
