import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function StalePivotsModal({ onClose, onJump }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [includeNull, setIncludeNull] = useState(false)
  const [expanded, setExpanded] = useState(() => localStorage.getItem('stalePivotsExpanded') === '1')
  useEffect(() => { localStorage.setItem('stalePivotsExpanded', expanded ? '1' : '0') }, [expanded])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api.getStalePivots({ includeNull })
      .then(r => { if (alive) { setData(r); setLoading(false) } })
      .catch(err => { if (alive) { setError(err.message); setLoading(false) } })
    return () => { alive = false }
  }, [includeNull])

  const total = data?.pivots?.reduce((s, p) => s + p.stale.length, 0) || 0

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal stale-pivots-modal ${expanded ? 'is-expanded' : ''}`}
        style={{
          width: expanded ? 'calc(100vw - 40px)' : 'min(960px, calc(100vw - 40px))',
          maxWidth: expanded ? 'none' : '960px',
          height: expanded ? 'calc(100vh - 60px)' : 'auto',
          maxHeight: expanded ? 'calc(100vh - 60px)' : '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Stale pivot rows</div>
            <div className="modal-subtitle">
              {loading ? 'Scanning…' : error ? 'Scan failed' : `${total} row${total !== 1 ? 's' : ''} across ${data?.pivots?.length || 0} pivot${(data?.pivots?.length || 0) !== 1 ? 's' : ''}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setExpanded(e => !e)}
              title={expanded ? 'Collapse' : 'Expand to fullscreen'}
              style={{ borderRadius: 6, width: 28, height: 24 }}
            >
              {expanded ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 14h6v6"/><path d="M20 10h-6V4"/>
                  <path d="M14 10l7-7"/><path d="M3 21l7-7"/>
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6"/><path d="M9 21H3v-6"/>
                  <path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
                </svg>
              )}
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body" style={{ overflow: 'auto', flex: 1 }}>
          <label className="stale-pivot-toggle">
            <input
              type="checkbox"
              checked={includeNull}
              onChange={e => setIncludeNull(e.target.checked)}
            />
            <span>Treat null FKs as stale</span>
            <span className="stale-pivot-toggle-hint">
              off by default — null FKs are often intentional
            </span>
          </label>
          {loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
              Scanning every pivot model for rows whose FK columns are null or point at missing records…
            </div>
          )}
          {error && (
            <div style={{ color: '#b91c1c', fontSize: 13, padding: '12px 0' }}>{error}</div>
          )}
          {!loading && !error && total === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
              No stale pivot rows found. All pivot FKs resolve to existing records.
            </div>
          )}
          {!loading && !error && data?.pivots?.map(p => (
            <div key={p.pivotModel} className="stale-pivot-group">
              <div className="stale-pivot-group-header">
                <span className="stale-pivot-group-name">{p.pivotModel}</span>
                <span className="stale-pivot-group-count">
                  {p.stale.length} stale row{p.stale.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="stale-pivot-table-wrap">
                <table className="stale-pivot-table">
                  <thead>
                    <tr>
                      <th>{p.idField}</th>
                      {p.sides.map(s => (
                        <th key={s.fk}>
                          {s.fk}
                          <span className="stale-pivot-side-target"> → {s.targetModel}</span>
                        </th>
                      ))}
                      <th className="stale-pivot-jump-col" />
                    </tr>
                  </thead>
                  <tbody>
                    {p.stale.map(row => {
                      const issuesByFk = Object.fromEntries(row.issues.map(i => [i.fk, i]))
                      return (
                        <tr key={String(row.id)}>
                          <td className="stale-pivot-id">{String(row.id)}</td>
                          {p.sides.map(s => {
                            const issue = issuesByFk[s.fk]
                            const v = row.fkValues[s.fk]
                            return (
                              <td key={s.fk} className={issue ? 'stale-pivot-cell-bad' : 'stale-pivot-cell-ok'}>
                                {v === null || v === undefined ? <span className="cell-null">null</span> : String(v)}
                                {issue && (
                                  <span className="stale-pivot-tag">
                                    {issue.reason === 'null' ? 'NULL' : 'ORPHAN'}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                          <td className="stale-pivot-jump-col">
                            <button
                              type="button"
                              className="stale-pivot-jump-btn"
                              onClick={() => onJump?.(p.pivotModel, p.idField, row.id)}
                              title={`Open ${p.pivotModel} filtered to row ${row.id}`}
                            >
                              Jump →
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
