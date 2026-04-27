import { useState } from 'react'
import RelationPickerTable from './RelationPickerTable.jsx'

function isAutoField(field) {
  if (field.isGenerated) return true
  if (field.isUpdatedAt) return true
  if (field.isList && field.relationName) return true
  if (field.isId) return true
  if (field.hasDefault) {
    const d = field.default
    if (!d) return false
    if (typeof d === 'object' && ['autoincrement', 'cuid', 'uuid', 'now'].includes(d.name)) return true
    if (typeof d === 'string' && d === 'now') return true
  }
  return false
}

const LABEL_FIELDS = [
  'name', 'displayName', 'fullName', 'firstName',
  'title', 'label', 'slug', 'username', 'handle',
  'companyName', 'businessName', 'email',
]

function getRecordLabel(record) {
  for (const k of LABEL_FIELDS) {
    if (record[k] !== undefined && record[k] !== null && record[k] !== '') {
      return { value: record[k], field: k }
    }
  }
  return null
}

const selectedChipStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  background: 'var(--relation-bg)',
  border: '1px solid var(--relation-color)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--text)',
}

function RelationPicker({ fkInfo, value, onChange, isRequired }) {
  const { modelName, valueField } = fkInfo
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(null)

  function handlePick(record) {
    const v = record[valueField]
    if (record.__raw) {
      setSelectedLabel(`(raw ID)`)
    } else {
      const lbl = getRecordLabel(record)
      setSelectedLabel(lbl ? `${lbl.value}` : null)
    }
    onChange(v)
    setPickerOpen(false)
  }

  function clear() {
    onChange('')
    setSelectedLabel(null)
  }

  return (
    <>
      {value ? (
        <div style={selectedChipStyle}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedLabel && <strong>{selectedLabel}</strong>}{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>{String(value)}</span>
          </span>
          <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{ background: 'none', border: '1px solid var(--relation-color)', color: 'var(--relation-color)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}
            >Change</button>
            <button
              type="button"
              onClick={clear}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
              title="Clear"
            >×</button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="form-input"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Choose a {modelName}…</span>
          <span style={{ color: 'var(--relation-color)', fontSize: 11 }}>Browse →</span>
        </button>
      )}

      {pickerOpen && (
        <RelationPickerTable
          modelName={modelName}
          valueField={valueField}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}

export default function AddRecordModal({ modelName, fields, onSubmit, onClose, saving }) {
  // Map FK scalar field name → { modelName, valueField }
  const fkMap = {}
  fields
    .filter(f => f.kind === 'object' && !f.isList && f.relationFromFields?.length > 0)
    .forEach(f => {
      f.relationFromFields.forEach((fkName, i) => {
        fkMap[fkName] = {
          modelName: f.type,
          valueField: f.relationToFields?.[i] ?? 'id',
        }
      })
    })

  const editableFields = fields.filter(f =>
    !isAutoField(f) && f.kind !== 'object' && !f.isList
  )

  const [values, setValues] = useState(() =>
    Object.fromEntries(
      editableFields.map(f => {
        if (f.type === 'Boolean') return [f.name, false]
        if (f.hasDefault && f.default !== null && typeof f.default !== 'object') {
          return [f.name, String(f.default)]
        }
        return [f.name, '']
      })
    )
  )

  const [errors, setErrors] = useState({})

  function validate() {
    const errs = {}
    for (const f of editableFields) {
      if (f.isRequired && f.type !== 'Boolean' && !values[f.name] && values[f.name] !== 0) {
        errs[f.name] = 'Required'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    const data = {}
    for (const f of editableFields) {
      const raw = values[f.name]
      if (raw === '' || raw === null || raw === undefined) {
        if (!f.isRequired) { data[f.name] = null; continue }
      }
      if (fkMap[f.name]) data[f.name] = raw
      else if (f.type === 'Int') data[f.name] = parseInt(raw, 10)
      else if (f.type === 'Float' || f.type === 'Decimal') data[f.name] = parseFloat(raw)
      else if (f.type === 'Boolean') data[f.name] = Boolean(raw)
      else if (f.type === 'DateTime') data[f.name] = new Date(raw).toISOString()
      else data[f.name] = raw
    }
    onSubmit(data)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Add record to {modelName}</div>
            <div className="modal-subtitle">{editableFields.length} field{editableFields.length !== 1 ? 's' : ''} to fill</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {editableFields.map(field => {
            const fkInfo = fkMap[field.name]
            const isFk = Boolean(fkInfo)

            return (
              <div className="form-field" key={field.name}>
                <label className="form-label">
                  {field.name}
                  {isFk && (
                    <span className="form-type-badge" style={{ color: 'var(--relation-color)', background: 'var(--relation-bg)' }}>
                      → {fkInfo.modelName}
                    </span>
                  )}
                  {!isFk && <span className="form-type-badge">{field.type}</span>}
                  {field.isRequired && <span className="form-required">*</span>}
                </label>

                {isFk ? (
                  <RelationPicker
                    fkInfo={fkInfo}
                    value={values[field.name]}
                    onChange={v => setValues(prev => ({ ...prev, [field.name]: v }))}
                    isRequired={field.isRequired}
                  />

                ) : field.type === 'Boolean' ? (
                  <div className="form-checkbox-row">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      id={`field-${field.name}`}
                      checked={Boolean(values[field.name])}
                      onChange={e => setValues(v => ({ ...v, [field.name]: e.target.checked }))}
                    />
                    <label htmlFor={`field-${field.name}`} className="form-checkbox-label">
                      {values[field.name] ? 'true' : 'false'}
                    </label>
                  </div>

                ) : (field.kind === 'enum' || field.enumValues?.length > 0) ? (
                  <select
                    className="form-select"
                    value={values[field.name] || ''}
                    onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                  >
                    {!field.isRequired && <option value="">— null —</option>}
                    {(field.enumValues || []).map(val => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>

                ) : field.type === 'DateTime' ? (
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={values[field.name] || ''}
                    onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                  />

                ) : (
                  <input
                    type={field.type === 'Int' || field.type === 'Float' ? 'number' : 'text'}
                    className="form-input"
                    placeholder={field.isRequired ? 'required' : 'null'}
                    value={values[field.name] || ''}
                    onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                    style={errors[field.name] ? { borderColor: 'var(--error)' } : {}}
                  />
                )}

                {errors[field.name] && (
                  <span style={{ fontSize: 11, color: 'var(--error)' }}>{errors[field.name]}</span>
                )}
              </div>
            )
          })}
        </form>

        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-create" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create record'}
          </button>
        </div>
      </div>
    </div>
  )
}
