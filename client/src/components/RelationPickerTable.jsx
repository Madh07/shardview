import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

function formatCellValue(val, type) {
  if (val === null || val === undefined) return ''
  if (Array.isArray(val)) return val.length === 0 ? '[]' : val.slice(0, 3).join(', ') + (val.length > 3 ? '…' : '')
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 40)
  if (type === 'DateTime') {
    try { return new Date(val).toLocaleDateString() } catch { return String(val) }
  }
  if (typeof val === 'boolean') return val ? '✓' : '✗'
  return String(val)
}

export default function RelationPickerTable({ modelName, valueField, onPick, onClose }) {
  const [schema, setSchema] = useState(null)
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [rawId, setRawId] = useState('')
  const timer = useRef(null)

  useEffect(() => {
    api.getSchema(modelName).then(setSchema).catch(() => {})
  }, [modelName])

  async function load(q, p) {
    setLoading(true)
    try {
      const data = await api.getRecords(modelName, {
        page: p,
        pageSize,
        search: q || undefined,
      })
      setRecords(data.records)
      setTotal(data.total)
    } catch { setRecords([]); setTotal(0) }
    finally { setLoading(false) }
  }

  useEffect(() => { load('', 1) }, [])

  function handleQueryChange(v) {
    setQuery(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); load(v, 1) }, 250)
  }

  function changePage(p) { setPage(p); load(query, p) }

  const columns = (() => {
    if (!schema) return []
    const scalars = schema.fields.filter(f => f.kind === 'scalar' && !f.isList)
    const idCols = scalars.filter(f => f.isId)
    const nonId = scalars.filter(f => !f.isId)
    const ordered = [...nonId, ...idCols]
    return ordered.slice(0, 6)
  })()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: 8,
        width: '90vw',
        maxWidth: 1100,
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-modal)',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Select a {modelName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {total} record{total !== 1 ? 's' : ''} · click a row to pick
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
          <input
            className="form-input"
            placeholder={`Search ${modelName}…`}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : records.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No records found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-alt)', zIndex: 1 }}>
                <tr>
                  {columns.map(col => (
                    <th key={col.name} style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border)',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                    }}>
                      {col.name}
                      <span style={{ color: 'var(--text-placeholder)', marginLeft: 4, fontSize: 10 }}>{col.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const v = r[valueField]
                  return (
                    <tr
                      key={String(v)}
                      onClick={() => onPick(r)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--relation-bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {columns.map(col => {
                        const isId = col.isId
                        return (
                          <td key={col.name} style={{
                            padding: '8px 10px',
                            color: isId ? 'var(--text-muted)' : 'var(--text)',
                            fontFamily: isId ? 'ui-monospace, monospace' : 'inherit',
                            fontSize: isId ? 11 : 12,
                            whiteSpace: 'nowrap',
                            maxWidth: 280,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {formatCellValue(r[col.name], col.type)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => changePage(page - 1)}
              style={{ padding: '4px 10px', cursor: page <= 1 ? 'default' : 'pointer' }}
            >‹</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => changePage(page + 1)}
              style={{ padding: '4px 10px', cursor: page >= totalPages ? 'default' : 'pointer' }}
            >›</button>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Or use raw ID:</span>
            <input
              className="form-input"
              style={{ width: 240 }}
              placeholder="Paste ID…"
              value={rawId}
              onChange={e => setRawId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && rawId.trim()) { e.preventDefault(); onPick({ [valueField]: rawId.trim(), __raw: true }) } }}
            />
            <button
              type="button"
              className="btn-create"
              disabled={!rawId.trim()}
              onClick={() => onPick({ [valueField]: rawId.trim(), __raw: true })}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >Use</button>
          </div>
        </div>
      </div>
    </div>
  )
}
