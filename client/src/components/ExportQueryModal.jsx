import { useMemo, useState } from 'react'
import { buildWhereObject, buildPrismaSnippet, jsLiteral } from '../lib/buildPrismaQuery.js'

export default function ExportQueryModal({
  modelName,
  filters,
  filterMode,
  search,
  baseSchema,
  schemaCache,
  orderBy,
  orderDir,
  page,
  pageSize,
  onClose,
}) {
  const [format, setFormat] = useState('prisma')
  const [includePagination, setIncludePagination] = useState(false)
  const [copied, setCopied] = useState(false)

  const where = useMemo(() => buildWhereObject({
    filters, filterMode, baseSchema, schemaCache, search,
  }), [filters, filterMode, baseSchema, schemaCache, search])

  const snippet = useMemo(() => {
    if (format === 'where-only') {
      return where ? jsLiteral(where) : '{}'
    }
    if (format === 'json') {
      return JSON.stringify(where ?? {}, null, 2)
    }
    return buildPrismaSnippet({
      modelName,
      where,
      orderBy: includePagination ? orderBy : undefined,
      orderDir: includePagination ? orderDir : undefined,
      page: includePagination ? page : undefined,
      pageSize: includePagination ? pageSize : undefined,
    })
  }, [format, where, modelName, includePagination, orderBy, orderDir, page, pageSize])

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select the textarea
      const ta = document.getElementById('export-query-textarea')
      if (ta) { ta.select(); document.execCommand('copy') }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Export current filter as query</div>
            <div className="modal-subtitle">
              {where ? 'Live preview of the Prisma query for the active filters.' : 'No active filters — empty query.'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="filter-mode-toggle" role="group">
              <button type="button" className={format === 'prisma' ? 'active' : ''} onClick={() => setFormat('prisma')}>Prisma</button>
              <button type="button" className={format === 'where-only' ? 'active' : ''} onClick={() => setFormat('where-only')}>where</button>
              <button type="button" className={format === 'json' ? 'active' : ''} onClick={() => setFormat('json')}>JSON</button>
            </div>
            {format === 'prisma' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={includePagination}
                  onChange={e => setIncludePagination(e.target.checked)}
                />
                Include sort & pagination
              </label>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn-create"
              onClick={copy}
              style={{ padding: '6px 14px', height: 30 }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <textarea
            id="export-query-textarea"
            readOnly
            value={snippet}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 280,
              maxHeight: 460,
              fontFamily: 'ui-monospace, SF Mono, monospace',
              fontSize: 12,
              padding: 12,
              background: 'var(--surface-alt)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              resize: 'vertical',
              lineHeight: 1.5,
              whiteSpace: 'pre',
              overflow: 'auto',
            }}
          />
        </div>

        <div className="modal-footer">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
            {filters?.length ?? 0} filter{(filters?.length ?? 0) !== 1 ? 's' : ''}
            {search ? ` · search: "${search}"` : ''}
          </span>
          <button className="btn-cancel" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
