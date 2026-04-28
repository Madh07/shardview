import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function StalePivotsModal({ onClose, onJump }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [includeNull, setIncludeNull] = useState(false)

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
      <div className="modal" style={{ maxWidth: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Stale pivot rows</div>
            <div className="modal-subtitle">
              {loading ? 'Scanning…' : error ? 'Scan failed' : `${total} row${total !== 1 ? 's' : ''} across ${data?.pivots?.length || 0} pivot${(data?.pivots?.length || 0) !== 1 ? 's' : ''}`}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
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
