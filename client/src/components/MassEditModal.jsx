import { useState } from 'react'
import RelationPickerTable from './RelationPickerTable.jsx'

function isMassEditable(field) {
  if (field.isId) return false
  if (field.isGenerated) return false
  if (field.isUpdatedAt) return false
  if (field.isList) return false
  if (field.kind === 'object') return false
  return true
}

const LABEL_FIELDS = [
  'name', 'displayName', 'fullName', 'firstName',
  'title', 'label', 'slug', 'username', 'handle',
  'companyName', 'businessName', 'email',
]
function recordLabel(r) {
  for (const k of LABEL_FIELDS) {
    if (r?.[k] !== undefined && r[k] !== null && r[k] !== '') return String(r[k])
  }
  return null
}

export default function MassEditModal({ modelName, fields, selectedCount, onSubmit, onClose, saving }) {
  const fkMap = {}
  fields
    .filter(f => f.kind === 'object' && !f.isList && f.relationFromFields?.length > 0)
    .forEach(f => f.relationFromFields.forEach((fk, i) => {
      fkMap[fk] = { modelName: f.type, valueField: f.relationToFields?.[i] || 'id' }
    }))

  const editableFields = fields.filter(isMassEditable)

  const [included, setIncluded] = useState({})
  const [values, setValues] = useState({})
  const [labels, setLabels] = useState({})
  const [pickerForField, setPickerForField] = useState(null)

  const enabledCount = Object.values(included).filter(Boolean).length

  function toggle(name) {
    setIncluded(prev => {
      const next = { ...prev, [name]: !prev[name] }
      if (!next[name]) {
        setValues(v => { const n = { ...v }; delete n[name]; return n })
        setLabels(l => { const n = { ...l }; delete n[name]; return n })
      }
      return next
    })
  }

  function setVal(name, v) {
    setValues(prev => ({ ...prev, [name]: v }))
  }

  function handleSubmit() {
    const data = {}
    for (const f of editableFields) {
      if (!included[f.name]) continue
      const raw = values[f.name]
      if (fkMap[f.name]) {
        data[f.name] = raw === '' || raw === undefined || raw === null ? null : raw
      } else if (f.type === 'Int') {
        data[f.name] = raw === '' || raw === undefined || raw === null ? null : parseInt(raw, 10)
      } else if (f.type === 'Float' || f.type === 'Decimal') {
        data[f.name] = raw === '' || raw === undefined || raw === null ? null : parseFloat(raw)
      } else if (f.type === 'Boolean') {
        data[f.name] = raw === true || raw === 'true'
      } else if (f.type === 'DateTime') {
        data[f.name] = raw ? new Date(raw).toISOString() : null
      } else {
        data[f.name] = raw === '' || raw === undefined ? null : raw
      }
    }
    if (Object.keys(data).length === 0) return
    onSubmit(data)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              Mass edit {selectedCount} {modelName} record{selectedCount !== 1 ? 's' : ''}
            </div>
            <div className="modal-subtitle">
              Toggle the fields you want to apply across all selected records.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); handleSubmit() }}
          className="modal-body"
        >
          {editableFields.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No editable fields on this model.
            </div>
          ) : editableFields.map(f => {
            const fkInfo = fkMap[f.name]
            const isEnabled = !!included[f.name]
            return (
              <div className="form-field mass-edit-row" key={f.name} style={{ opacity: isEnabled ? 1 : 0.55 }}>
                <label className="form-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={isEnabled}
                    onChange={() => toggle(f.name)}
                    style={{ marginRight: 4 }}
                  />
                  <span>{f.name}</span>
                  {fkInfo
                    ? <span className="form-type-badge" style={{ color: 'var(--relation-color)', background: 'var(--relation-bg)' }}>→ {fkInfo.modelName}</span>
                    : <span className="form-type-badge">{f.type}</span>}
                </label>

                {isEnabled && (() => {
                  if (fkInfo) {
                    const v = values[f.name]
                    const lbl = labels[f.name]
                    if (v) {
                      return (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 10px', background: 'var(--relation-bg)',
                          border: '1px solid var(--relation-color)', borderRadius: 6, fontSize: 13,
                        }}>
                          <span>
                            {lbl && <strong>{lbl}</strong>}{' '}
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>{String(v)}</span>
                          </span>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => setPickerForField(f.name)}
                              style={{ background: 'none', border: '1px solid var(--relation-color)', color: 'var(--relation-color)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}
                            >Change</button>
                            <button
                              type="button"
                              onClick={() => { setVal(f.name, ''); setLabels(l => { const n = { ...l }; delete n[f.name]; return n }) }}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                            >×</button>
                          </span>
                        </div>
                      )
                    }
                    return (
                      <button
                        type="button"
                        className="form-input"
                        style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onClick={() => setPickerForField(f.name)}
                      >
                        <span>Choose a {fkInfo.modelName}…</span>
                        <span style={{ color: 'var(--relation-color)', fontSize: 11 }}>Browse →</span>
                      </button>
                    )
                  }
                  if (f.type === 'Boolean') {
                    return (
                      <select
                        className="form-select"
                        value={String(values[f.name] === true || values[f.name] === 'true')}
                        onChange={e => setVal(f.name, e.target.value === 'true')}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    )
                  }
                  if (f.kind === 'enum' || f.enumValues?.length > 0) {
                    return (
                      <select
                        className="form-select"
                        value={values[f.name] || ''}
                        onChange={e => setVal(f.name, e.target.value)}
                      >
                        {!f.isRequired && <option value="">— null —</option>}
                        {(f.enumValues || []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    )
                  }
                  if (f.type === 'DateTime') {
                    return (
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={values[f.name] || ''}
                        onChange={e => setVal(f.name, e.target.value)}
                      />
                    )
                  }
                  return (
                    <input
                      type={f.type === 'Int' || f.type === 'Float' ? 'number' : 'text'}
                      className="form-input"
                      placeholder="value (empty = null)"
                      value={values[f.name] ?? ''}
                      onChange={e => setVal(f.name, e.target.value)}
                    />
                  )
                })()}
              </div>
            )
          })}
        </form>

        <div className="modal-footer">
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
            {enabledCount === 0
              ? 'No fields selected'
              : `Will set ${enabledCount} field${enabledCount !== 1 ? 's' : ''} on ${selectedCount} record${selectedCount !== 1 ? 's' : ''}`}
          </span>
          <button className="btn-cancel" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="btn-create"
            onClick={handleSubmit}
            disabled={saving || enabledCount === 0}
          >
            {saving ? 'Updating…' : 'Apply'}
          </button>
        </div>

        {pickerForField && fkMap[pickerForField] && (
          <RelationPickerTable
            modelName={fkMap[pickerForField].modelName}
            valueField={fkMap[pickerForField].valueField}
            onClose={() => setPickerForField(null)}
            onPick={picked => {
              const vf = fkMap[pickerForField].valueField
              const v = picked[vf]
              setVal(pickerForField, v)
              setLabels(l => ({ ...l, [pickerForField]: picked.__raw ? null : recordLabel(picked) }))
              setPickerForField(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
