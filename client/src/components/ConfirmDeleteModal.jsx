import { useState } from 'react'

export default function ConfirmDeleteModal({ title, message, onCancel, onConfirm, busy }) {
  const [cascade, setCascade] = useState(false)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ color: 'var(--error)' }}>{title}</div>
            <div className="modal-subtitle">This action cannot be undone.</div>
          </div>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{message}</p>

          <label className="form-checkbox-row" style={{ marginTop: 6, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              className="form-checkbox"
              checked={cascade}
              onChange={e => setCascade(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13 }}>
              <strong>Force cascade delete</strong>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                Recursively delete every record that references this one across all models. Use when the schema doesn't have <code style={{ fontFamily: 'ui-monospace, monospace' }}>onDelete: Cascade</code>.
              </div>
            </span>
          </label>

          {cascade && (
            <div style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(255,149,0,0.10)',
              border: '1px solid rgba(255,149,0,0.30)',
              borderRadius: 6,
              color: 'var(--warning)',
              fontSize: 11.5,
              lineHeight: 1.45,
            }}>
              ⚠ This walks every FK relation pointing to the target and deletes dependents recursively. May affect many records.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="btn-create"
            style={{ background: 'var(--error)' }}
            onClick={() => onConfirm({ cascade })}
            disabled={busy}
          >
            {busy ? 'Deleting…' : (cascade ? 'Cascade delete' : 'Delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
