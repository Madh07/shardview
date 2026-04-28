import { useState } from 'react'
import RelationPickerTable from './RelationPickerTable.jsx'

// Function-style defaults (DMMF wraps them as { name, args }). Used both to
// hide truly-generated fields (id with autoincrement/sequence) and to render
// a hint placeholder on the rest so the user knows leaving the input blank
// applies the default.
const FN_DEFAULT_NAMES = new Set([
  'autoincrement', 'cuid', 'uuid', 'now', 'nanoid', 'ulid', 'dbgenerated', 'sequence',
])

function isFnDefault(field) {
  if (!field.hasDefault) return false
  const d = field.default
  return Boolean(d && typeof d === 'object' && FN_DEFAULT_NAMES.has(d.name))
}

// Field is fully "auto" — never editable. Reserved for: PKs that have a
// function default (autoincrement/sequence/cuid/uuid/etc.), DB-generated
// columns, @updatedAt (Prisma overwrites the value on every write), and list
// relations. Everything else (incl. createdAt with @default(now())) stays
// visible so users can optionally override the default.
function isAutoField(field) {
  if (field.isUpdatedAt) return true
  if (field.isList && field.relationName) return true
  if (field.isId && (field.isGenerated || isFnDefault(field))) return true
  // dbgenerated columns are computed by the DB on every write — never editable
  if (field.hasDefault && typeof field.default === 'object' && field.default?.name === 'dbgenerated') return true
  return false
}

function defaultHint(field) {
  if (!field.hasDefault) return null
  const d = field.default
  if (d === null || d === undefined) return null
  if (typeof d === 'object' && d.name) {
    if (Array.isArray(d.args) && d.args.length > 0) return `default: ${d.name}(${d.args.map(a => JSON.stringify(a)).join(', ')})`
    return `default: ${d.name}()`
  }
  return `default: ${JSON.stringify(d)}`
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

// Convert a raw field value (from a record, possibly a relation object) into
// the string the form input expects.
function rawToFormValue(field, raw) {
  if (raw === null || raw === undefined) return ''
  if (field.type === 'Boolean') return Boolean(raw)
  if (field.type === 'DateTime') {
    try { return new Date(raw).toISOString().slice(0, 16) } catch { return '' }
  }
  return String(raw)
}

// `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in the *local*
// timezone — `toISOString` would shift to UTC and display the wrong wall time.
function nowLocalForInput() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AddRecordModal({ modelName, fields, onSubmit, onClose, saving, initialValues = null, title }) {
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
        if (initialValues && Object.prototype.hasOwnProperty.call(initialValues, f.name)) {
          return [f.name, rawToFormValue(f, initialValues[f.name])]
        }
        if (f.type === 'Boolean') {
          if (f.hasDefault && typeof f.default === 'boolean') return [f.name, f.default]
          return [f.name, false]
        }
        // For function-style defaults (now, cuid, …) keep the input empty so
        // submission omits the field and Prisma applies the default. Literal
        // scalar defaults still pre-fill so the user sees what will be saved.
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
      if (f.type === 'Boolean') continue
      const v = values[f.name]
      const isEmpty = v === '' || v === null || v === undefined
      // Required + empty is only an error when there's no default the DB can fill.
      if (f.isRequired && isEmpty && !f.hasDefault) {
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
      const isEmpty = raw === '' || raw === null || raw === undefined
      if (isEmpty) {
        // Omit fields with a default so Prisma/DB applies it. For the rest,
        // send explicit null when the column is nullable; otherwise omit and
        // let Prisma surface the validation error.
        if (f.hasDefault) continue
        if (!f.isRequired) { data[f.name] = null; continue }
        continue
      }
      if (fkMap[f.name]) data[f.name] = raw
      else if (f.type === 'Int') data[f.name] = parseInt(raw, 10)
      else if (f.type === 'Float' || f.type === 'Decimal') data[f.name] = parseFloat(raw)
      else if (f.type === 'Boolean') data[f.name] = Boolean(raw)
      else if (f.type === 'DateTime') {
        const d = new Date(raw)
        if (Number.isNaN(d.getTime())) continue
        data[f.name] = d.toISOString()
      }
      else data[f.name] = raw
    }
    onSubmit(data)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{title || `Add record to ${modelName}`}</div>
            <div className="modal-subtitle">
              {editableFields.length} field{editableFields.length !== 1 ? 's' : ''} to fill
              {initialValues ? ' · pre-filled from source row' : ''}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {editableFields.map(field => {
            const fkInfo = fkMap[field.name]
            const isFk = Boolean(fkInfo)
            const hint = defaultHint(field)
            const fnDefault = isFnDefault(field)

            return (
              <div
                className={`form-field ${fnDefault ? 'has-fn-default' : ''} ${!fnDefault && field.hasDefault ? 'has-literal-default' : ''}`}
                key={field.name}
              >
                <label className="form-label">
                  {field.name}
                  {isFk && (
                    <span className="form-type-badge" style={{ color: 'var(--relation-color)', background: 'var(--relation-bg)' }}>
                      → {fkInfo.modelName}
                    </span>
                  )}
                  {!isFk && <span className="form-type-badge">{field.type}</span>}
                  {fnDefault && (
                    <span className="form-default-badge" title="Leave empty to use this default; type a value to override">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 10 15 10"/>
                      </svg>
                      auto
                    </span>
                  )}
                  {!fnDefault && field.hasDefault && (
                    <span className="form-default-badge form-default-badge-literal" title="Pre-filled from schema default; edit to override">
                      default
                    </span>
                  )}
                  {field.isRequired && !field.hasDefault && <span className="form-required">*</span>}
                  {hint && <span className="form-default-hint" title="Leave empty to apply this default">{hint}</span>}
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
                  <div className="form-datetime-row">
                    <input
                      type="datetime-local"
                      className="form-input"
                      placeholder={fnDefault ? `auto · ${hint || 'default'}` : field.hasDefault ? 'leave empty for default' : (field.isRequired ? 'required' : 'null')}
                      value={values[field.name] || ''}
                      onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="form-datetime-now"
                      onClick={() => setValues(v => ({ ...v, [field.name]: nowLocalForInput() }))}
                      title="Set to current date and time"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9"/>
                        <polyline points="12 7 12 12 15 14"/>
                      </svg>
                      Now
                    </button>
                    {values[field.name] && (
                      <button
                        type="button"
                        className="form-datetime-clear"
                        onClick={() => setValues(v => ({ ...v, [field.name]: '' }))}
                        title="Clear"
                      >×</button>
                    )}
                  </div>

                ) : (
                  <input
                    type={field.type === 'Int' || field.type === 'Float' ? 'number' : 'text'}
                    className="form-input"
                    placeholder={fnDefault ? `auto · ${hint || 'default'}` : field.hasDefault ? 'leave empty for default' : (field.isRequired ? 'required' : 'null')}
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
