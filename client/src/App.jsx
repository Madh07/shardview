import { useState, useEffect, useRef } from 'react'
import { api, setPivotOverrides } from './api.js'
import Sidebar from './components/Sidebar.jsx'
import TabBar from './components/TabBar.jsx'
import Toolbar from './components/Toolbar.jsx'
import FilterBar from './components/FilterBar.jsx'
import DataTable from './components/DataTable.jsx'
import AddRecordModal from './components/AddRecordModal.jsx'
import PivotView from './components/PivotView.jsx'
import ConfirmDeleteModal from './components/ConfirmDeleteModal.jsx'
import MassEditModal from './components/MassEditModal.jsx'
import ExportQueryModal from './components/ExportQueryModal.jsx'
import StalePivotsModal from './components/StalePivotsModal.jsx'

const PAGE_SIZES = [10, 20, 50, 100]

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className={`toast ${type}`} onClick={onDismiss}>
      {type === 'error'
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
      }
      {message}
    </div>
  )
}

function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  function pages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const p = []
    p.push(1)
    if (page > 3) p.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) p.push(i)
    if (page < totalPages - 2) p.push('...')
    p.push(totalPages)
    return p
  }

  return (
    <div className="pagination">
      <span className="pagination-info">
        {total === 0 ? 'No records' : <>Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> records</>}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rows per page</span>
      <select className="page-size-select" value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <div className="pagination-pages">
        <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹
        </button>
        {pages().map((p, i) =>
          p === '...'
            ? <span key={`dots-${i}`} className="page-dots">…</span>
            : <button key={p} className={`page-btn ${p === page ? 'current' : ''}`} onClick={() => onPage(p)}>{p}</button>
        )}
        <button className="page-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          ›
        </button>
      </div>
    </div>
  )
}

function makeTabId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const TABS_LS_KEY = 'shardview:tabs'

function loadPersistedTabs() {
  try {
    const raw = localStorage.getItem(TABS_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.tabs)) return null
    const tabs = parsed.tabs
      .filter(t => t && typeof t.modelName === 'string' && typeof t.id === 'string')
      .map(t => ({
        id: t.id,
        modelName: t.modelName,
        page: typeof t.page === 'number' && t.page > 0 ? t.page : 1,
        pageSize: typeof t.pageSize === 'number' && t.pageSize > 0 ? t.pageSize : 20,
        orderBy: typeof t.orderBy === 'string' ? t.orderBy : null,
        orderDir: t.orderDir === 'desc' ? 'desc' : 'asc',
        search: typeof t.search === 'string' ? t.search : '',
        filters: Array.isArray(t.filters) ? t.filters : [],
        filterMode: t.filterMode === 'OR' ? 'OR' : 'AND',
        filterOpen: !!t.filterOpen,
        pivotMode: ['off', 'joined', 'cards'].includes(t.pivotMode) ? t.pivotMode : 'off',
        schema: null,
        records: [],
        total: 0,
        loading: false,
        selectedRows: new Set(),
      }))
    if (tabs.length === 0) return null
    const activeTabId = tabs.some(t => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0].id
    return { tabs, activeTabId }
  } catch { return null }
}

function newTabState(modelName, initialFilters) {
  return {
    id: makeTabId(),
    modelName,
    page: 1,
    pageSize: 20,
    orderBy: null,
    orderDir: 'asc',
    search: '',
    filters: Array.isArray(initialFilters) ? initialFilters : [],
    filterMode: 'AND',
    filterOpen: Array.isArray(initialFilters) && initialFilters.length > 0,
    pivotMode: 'off',  // 'off' | 'joined' | 'cards'
    schema: null,
    records: [],
    total: 0,
    loading: false,
    selectedRows: new Set(),
  }
}

export default function App() {
  const [models, setModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelSearch, setModelSearch] = useState('')
  const persisted = useState(() => loadPersistedTabs())[0]
  const [tabs, setTabs] = useState(() => persisted?.tabs || [])
  const [activeTabId, setActiveTabId] = useState(() => persisted?.activeTabId || null)
  const [schemaCache, setSchemaCache] = useState({})
  const schemaLoadingRef = useRef(new Set())
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = parseInt(localStorage.getItem('sidebarWidth') || '', 10)
    return Number.isFinite(v) && v >= 180 && v <= 600 ? v : 240
  })
  const [pinnedModels, setPinnedModels] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('pinnedModels') || '[]')
      return Array.isArray(v) ? v : []
    } catch { return [] }
  })
  const [pivotOverrides, setPivotOverridesState] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('pivotOverrides') || '[]')
      return Array.isArray(v) ? v : []
    } catch { return [] }
  })
  const [viewLayout, setViewLayout] = useState(() => {
    const v = localStorage.getItem('viewLayout')
    return v === 'document' ? 'document' : 'table'
  })
  useEffect(() => { localStorage.setItem('viewLayout', viewLayout) }, [viewLayout])
  const [autoReloadSeconds, setAutoReloadSeconds] = useState(() => {
    const v = parseInt(localStorage.getItem('autoReloadSeconds') || '0', 10)
    return Number.isFinite(v) && v >= 0 ? v : 0
  })
  useEffect(() => { localStorage.setItem('autoReloadSeconds', String(autoReloadSeconds)) }, [autoReloadSeconds])
  const [reloading, setReloading] = useState(false)
  const [docLabelWidth, setDocLabelWidth] = useState(() => {
    const v = parseInt(localStorage.getItem('docLabelWidth') || '', 10)
    return Number.isFinite(v) && v >= 80 && v <= 600 ? v : 180
  })
  useEffect(() => { localStorage.setItem('docLabelWidth', String(docLabelWidth)) }, [docLabelWidth])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [duplicateSource, setDuplicateSource] = useState(null)  // { values } pre-fill for AddRecordModal
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [deleteRequest, setDeleteRequest] = useState(null)  // { kind: 'row'|'bulk', ids: [], busy }
  const [massEditOpen, setMassEditOpen] = useState(false)
  const [massEditSaving, setMassEditSaving] = useState(false)
  const [stalePivotsOpen, setStalePivotsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const searchTimer = useRef(null)
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  const activeTab = tabs.find(t => t.id === activeTabId) || null

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('pinnedModels', JSON.stringify(pinnedModels))
  }, [pinnedModels])

  // Sync overrides to the API helper module + storage. Skip the very first
  // render so we don't fire a redundant /api/models call (useEffect on load
  // already triggers loadModels()).
  const firstOverrideRender = useRef(true)
  useEffect(() => {
    localStorage.setItem('pivotOverrides', JSON.stringify(pivotOverrides))
    setPivotOverrides(pivotOverrides)
    if (firstOverrideRender.current) {
      firstOverrideRender.current = false
      return
    }
    // Re-fetch models so badges reflect the override immediately.
    loadModels()
  }, [pivotOverrides])

  async function handleReload() {
    if (!activeTab) return
    setReloading(true)
    try {
      // Drop the cached schema so a fresh one is fetched (covers edits to
      // schema.prisma since the server boot — schema endpoint reparses on
      // each request).
      setSchemaCache(prev => {
        const next = { ...prev }
        delete next[activeTab.modelName]
        return next
      })
      patchTab(activeTab.id, { schema: null })
      await loadModels()
      const fresh = await api.getSchema(activeTab.modelName)
      setSchemaCache(prev => ({ ...prev, [activeTab.modelName]: fresh }))
      patchTab(activeTab.id, { schema: fresh })
      await fetchRecords(activeTab.id)
    } catch (err) {
      showToast('Reload failed: ' + err.message)
    } finally {
      setReloading(false)
    }
  }

  // Auto-reload records (not schema) on a configurable interval.
  useEffect(() => {
    if (!autoReloadSeconds || !activeTab?.id || !activeTab?.schema) return
    const tabId = activeTab.id
    const t = setInterval(() => { fetchRecords(tabId) }, autoReloadSeconds * 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReloadSeconds, activeTab?.id, activeTab?.schema])

  function togglePivotOverride(name) {
    setPivotOverridesState(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  // Persist tabs and active tab so the view survives a reload.
  useEffect(() => {
    try {
      const serializable = tabs.map(t => ({
        id: t.id,
        modelName: t.modelName,
        page: t.page,
        pageSize: t.pageSize,
        orderBy: t.orderBy,
        orderDir: t.orderDir,
        search: t.search,
        filters: t.filters,
        filterMode: t.filterMode,
        filterOpen: t.filterOpen,
        pivotMode: t.pivotMode,
      }))
      if (serializable.length === 0) {
        localStorage.removeItem(TABS_LS_KEY)
      } else {
        localStorage.setItem(TABS_LS_KEY, JSON.stringify({ tabs: serializable, activeTabId }))
      }
    } catch {}
  }, [tabs, activeTabId])

  // Cmd/Ctrl + W closes the active tab
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W')) {
        if (activeTabId) {
          e.preventDefault()
          closeTab(activeTabId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  function togglePin(modelName) {
    setPinnedModels(prev =>
      prev.includes(modelName)
        ? prev.filter(n => n !== modelName)
        : [...prev, modelName]
    )
  }

  function reorderPinned(fromIdx, toIdx) {
    setPinnedModels(prev => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }

  function startSidebarResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function onMove(ev) {
      const next = Math.max(180, Math.min(600, startWidth + (ev.clientX - startX)))
      setSidebarWidth(next)
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

  function showToast(message, type = 'error') {
    setToast({ message, type, key: Date.now() })
  }

  function patchTab(id, patch) {
    setTabs(ts => ts.map(t => {
      if (t.id !== id) return t
      const np = typeof patch === 'function' ? patch(t) : patch
      return { ...t, ...np }
    }))
  }

  async function loadModels() {
    setModelsLoading(true)
    try {
      const data = await api.getModels()
      setModels(data)
      if (tabsRef.current.length === 0 && data.length > 0) {
        openTab(data[0].name)
      }
    } catch (err) {
      showToast('Failed to load models: ' + err.message)
    } finally {
      setModelsLoading(false)
    }
  }

  useEffect(() => { loadModels() }, [])

  // Eagerly load pivot model schemas so the table can render through-pivot
  // jump buttons without waiting for a hover-trigger fetch.
  useEffect(() => {
    models.filter(m => m.isPivot).forEach(m => ensureSchema(m.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  function openTab(modelName, initialFilters = null, opts = {}) {
    const newTabFlag = !!opts.newTab
    const existing = tabsRef.current.find(t => t.modelName === modelName)
    if (existing) {
      setActiveTabId(existing.id)
      if (Array.isArray(initialFilters) && initialFilters.length > 0) {
        patchTab(existing.id, { filters: initialFilters, filterOpen: true, page: 1, search: '' })
      }
      return
    }
    // Default: replace the current active tab (single-tab UX) unless explicit new tab requested
    if (!newTabFlag && activeTabId && tabsRef.current.some(t => t.id === activeTabId)) {
      const fresh = newTabState(modelName, initialFilters)
      setTabs(ts => ts.map(t => t.id === activeTabId ? { ...fresh, id: activeTabId } : t))
      return
    }
    const tab = newTabState(modelName, initialFilters)
    setTabs(ts => [...ts, tab])
    setActiveTabId(tab.id)
  }

  async function ensureSchema(modelName) {
    if (!modelName) return null
    if (schemaCache[modelName]) return schemaCache[modelName]
    if (schemaLoadingRef.current.has(modelName)) return null
    schemaLoadingRef.current.add(modelName)
    try {
      const s = await api.getSchema(modelName)
      setSchemaCache(prev => prev[modelName] ? prev : { ...prev, [modelName]: s })
      return s
    } catch (err) {
      return null
    } finally {
      schemaLoadingRef.current.delete(modelName)
    }
  }

  function reorderTabs(fromIdx, toIdx) {
    setTabs(ts => {
      if (fromIdx < 0 || fromIdx >= ts.length || toIdx < 0 || toIdx >= ts.length) return ts
      const next = [...ts]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }

  function closeTab(id) {
    setTabs(ts => {
      const idx = ts.findIndex(t => t.id === id)
      const next = ts.filter(t => t.id !== id)
      if (activeTabId === id) {
        const fallback = next[idx] || next[idx - 1] || null
        setActiveTabId(fallback ? fallback.id : null)
      }
      return next
    })
  }

  // Schema fetch (and eagerly load 1-level relation schemas for filter UI)
  useEffect(() => {
    if (!activeTab || activeTab.schema) return
    let cancelled = false
    api.getSchema(activeTab.modelName).then(s => {
      if (cancelled) return
      const idField = s.fields.find(f => f.isId)
      patchTab(activeTab.id, t => ({ schema: s, orderBy: t.orderBy || (idField?.name || 'id') }))
      setSchemaCache(prev => prev[activeTab.modelName] ? prev : { ...prev, [activeTab.modelName]: s })
      const relTypes = [...new Set(s.fields.filter(f => f.kind === 'object').map(f => f.type))]
      relTypes.forEach(m => ensureSchema(m))
    }).catch(err => showToast('Failed to load schema: ' + err.message))
    return () => { cancelled = true }
  }, [activeTab?.id, activeTab?.schema])

  // Records fetch (search excluded — debounced manually)
  const filtersKey = activeTab ? JSON.stringify(activeTab.filters || []) : ''
  useEffect(() => {
    if (!activeTab || !activeTab.schema) return
    fetchRecords(activeTab.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab?.id,
    activeTab?.schema,
    activeTab?.page,
    activeTab?.pageSize,
    activeTab?.orderBy,
    activeTab?.orderDir,
    filtersKey,
    activeTab?.filterMode,
  ])

  async function fetchRecords(tabId) {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab) return
    patchTab(tabId, { loading: true })
    try {
      const validFilters = (tab.filters || []).filter(f =>
        Array.isArray(f.path) && f.path.length > 0 && f.op && f.value !== '' && f.value !== null && f.value !== undefined
      )
      const params = {
        page: tab.page,
        pageSize: tab.pageSize,
        orderBy: tab.orderBy || 'id',
        orderDir: tab.orderDir,
        search: tab.search || undefined,
        filters: validFilters.length > 0 ? JSON.stringify(validFilters) : undefined,
        filterMode: validFilters.length > 1 ? (tab.filterMode || 'AND') : undefined,
      }
      const data = await api.getRecords(tab.modelName, params)
      patchTab(tabId, { records: data.records, total: data.total, loading: false })
    } catch (err) {
      showToast('Failed to load records: ' + err.message)
      patchTab(tabId, { loading: false })
    }
  }

  async function navigateThroughPivot(otherSide, record) {
    if (!activeTab) return
    try {
      const targetSchema = schemaCache[otherSide.targetModel] || await ensureSchema(otherSide.targetModel)
      if (!targetSchema) return
      const inverseListRel = targetSchema.fields.find(f =>
        f.kind === 'object' && f.isList && f.relationName === otherSide.pivotRelToTargetRelationName
      )
      if (!inverseListRel) {
        showToast('Cannot determine inverse relation through pivot')
        return
      }
      const valForFilter = record[otherSide.currentToField]
      if (valForFilter === undefined || valForFilter === null) return
      openTab(otherSide.targetModel, [{
        path: [inverseListRel.name, otherSide.fkToCurrent],
        op: 'equals',
        value: String(valForFilter),
      }], { newTab: true })
    } catch (err) {
      showToast('Pivot navigation failed: ' + err.message)
    }
  }

  async function navigateToRelation(field, record) {
    if (!activeTab || field.kind !== 'object') return
    const idField = activeTab.schema?.fields.find(f => f.isId)?.name || 'id'
    try {
      if (!field.isList) {
        const related = record[field.name]
        if (!related || typeof related !== 'object') return
        const toField = field.relationToFields?.[0] || 'id'
        const targetVal = related[toField]
        if (targetVal === undefined || targetVal === null) return
        openTab(field.type, [{ path: [toField], op: 'equals', value: String(targetVal) }], { newTab: true })
      } else {
        const targetSchema = await api.getSchema(field.type)
        const inverseRel = targetSchema.fields.find(f =>
          f.relationName === field.relationName && f.kind === 'object' && !f.isList
        )
        if (!inverseRel || !inverseRel.relationFromFields?.length) {
          showToast('Cannot determine inverse relation for navigation')
          return
        }
        const inverseFk = inverseRel.relationFromFields[0]
        const idVal = record[idField]
        if (idVal === undefined || idVal === null) return
        openTab(field.type, [{ path: [inverseFk], op: 'equals', value: String(idVal) }], { newTab: true })
      }
    } catch (err) {
      showToast('Navigation failed: ' + err.message)
    }
  }

  function handleSearchChange(val) {
    if (!activeTab) return
    patchTab(activeTab.id, { search: val })
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      const tabId = activeTab.id
      patchTab(tabId, { page: 1 })
      fetchRecords(tabId)
    }, 300)
  }

  function handleSort(field) {
    if (!activeTab) return
    if (activeTab.orderBy === field) {
      patchTab(activeTab.id, t => ({ orderDir: t.orderDir === 'asc' ? 'desc' : 'asc', page: 1 }))
    } else {
      patchTab(activeTab.id, { orderBy: field, orderDir: 'asc', page: 1 })
    }
  }

  async function handleUpdateCell(id, fieldName, value) {
    if (!activeTab) return
    try {
      const updated = await api.updateRecord(activeTab.modelName, id, { [fieldName]: value })
      const idField = activeTab.schema?.fields.find(f => f.isId)?.name || 'id'
      patchTab(activeTab.id, t => ({
        records: t.records.map(r => r[idField] === id ? { ...r, ...updated } : r),
      }))
      // Reload schema/include for relation cells
      fetchRecords(activeTab.id)
      await loadModels()
    } catch (err) {
      showToast('Update failed: ' + err.message)
    }
  }

  function handleDeleteRow(id) {
    if (!activeTab) return
    setDeleteRequest({ kind: 'row', ids: [id], busy: false })
  }

  function handleDeleteSelected() {
    if (!activeTab || activeTab.selectedRows.size === 0) return
    setDeleteRequest({ kind: 'bulk', ids: Array.from(activeTab.selectedRows), busy: false })
  }

  async function performDelete({ cascade }) {
    if (!activeTab || !deleteRequest) return
    setDeleteRequest(prev => prev ? { ...prev, busy: true } : prev)
    const { kind, ids } = deleteRequest
    try {
      if (kind === 'row') {
        const id = ids[0]
        const result = await api.deleteRecord(activeTab.modelName, id, { cascade })
        const idField = activeTab.schema?.fields.find(f => f.isId)?.name || 'id'
        patchTab(activeTab.id, t => {
          const sel = new Set(t.selectedRows); sel.delete(String(id))
          return {
            records: t.records.filter(r => r[idField] !== id),
            total: Math.max(0, t.total - 1),
            selectedRows: sel,
          }
        })
        if (cascade) await fetchRecords(activeTab.id)
        await loadModels()
        showToast(
          cascade
            ? `Cascade deleted ${result.deleted} record${result.deleted !== 1 ? 's' : ''}`
            : 'Record deleted',
          'success'
        )
      } else {
        const result = await api.deleteRecords(activeTab.modelName, ids, { cascade })
        patchTab(activeTab.id, { selectedRows: new Set() })
        await fetchRecords(activeTab.id)
        await loadModels()
        showToast(
          cascade
            ? `Cascade deleted ${result.deleted} record${result.deleted !== 1 ? 's' : ''}`
            : `Deleted ${result.deleted} record${result.deleted !== 1 ? 's' : ''}`,
          'success'
        )
      }
      setDeleteRequest(null)
    } catch (err) {
      showToast('Delete failed: ' + err.message)
      setDeleteRequest(prev => prev ? { ...prev, busy: false } : prev)
    }
  }

  async function handleMassEdit(data) {
    if (!activeTab || activeTab.selectedRows.size === 0) return
    setMassEditSaving(true)
    try {
      const ids = Array.from(activeTab.selectedRows)
      const result = await api.updateRecords(activeTab.modelName, ids, data)
      setMassEditOpen(false)
      await fetchRecords(activeTab.id)
      showToast(`Updated ${result.updated} record${result.updated !== 1 ? 's' : ''}`, 'success')
    } catch (err) {
      showToast('Mass edit failed: ' + err.message)
    } finally {
      setMassEditSaving(false)
    }
  }

  async function handleAddRecord(data) {
    if (!activeTab) return
    setSaving(true)
    try {
      await api.createRecord(activeTab.modelName, data)
      setAddModalOpen(false)
      setDuplicateSource(null)
      await fetchRecords(activeTab.id)
      await loadModels()
      showToast('Record created', 'success')
    } catch (err) {
      showToast('Create failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Open the Add modal pre-filled from an existing row. We pass the raw record
  // straight through; AddRecordModal handles type coercion + skipping auto
  // fields (id/@default(now())/etc.) so we never carry the source row's PK.
  function handleDuplicateRow(record) {
    if (!activeTab) return
    setDuplicateSource({ values: record })
    setAddModalOpen(true)
  }

  function toggleRow(id) {
    if (!activeTab) return
    patchTab(activeTab.id, t => {
      const n = new Set(t.selectedRows)
      n.has(id) ? n.delete(id) : n.add(id)
      return { selectedRows: n }
    })
  }

  function toggleAll() {
    if (!activeTab) return
    const idField = activeTab.schema?.fields.find(f => f.isId)?.name || 'id'
    patchTab(activeTab.id, t => {
      const allIds = t.records.map(r => String(r[idField]))
      const allSelected = allIds.every(id => t.selectedRows.has(id))
      const next = new Set(t.selectedRows)
      if (allSelected) allIds.forEach(id => next.delete(id))
      else allIds.forEach(id => next.add(id))
      return { selectedRows: next }
    })
  }

  function setFilters(filters) {
    if (!activeTab) return
    patchTab(activeTab.id, { filters, page: 1 })
  }

  function setFilterMode(mode) {
    if (!activeTab) return
    patchTab(activeTab.id, { filterMode: mode, page: 1 })
  }

  function setFilterOpen(open) {
    if (!activeTab) return
    patchTab(activeTab.id, typeof open === 'function'
      ? t => ({ filterOpen: open(t.filterOpen) })
      : { filterOpen: open })
  }

  function clearFilters() {
    if (!activeTab) return
    patchTab(activeTab.id, { filters: [], page: 1, filterOpen: false })
  }

  const idField = activeTab?.schema?.fields.find(f => f.isId)?.name || 'id'

  const activeModelMeta = activeTab ? models.find(m => m.name === activeTab.modelName) : null
  const isPivot = !!activeModelMeta?.isPivot

  const pivotSides = activeTab?.schema
    ? activeTab.schema.fields
        .filter(f => f.kind === 'object' && !f.isList && f.relationFromFields?.length > 0)
        .map(f => f.type)
    : []

  return (
    <div className="app">
      <Sidebar
        models={models}
        selectedModel={activeTab?.modelName || null}
        onSelect={(name, opts) => openTab(name, null, opts)}
        loading={modelsLoading}
        search={modelSearch}
        onSearchChange={setModelSearch}
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        width={sidebarWidth}
        onResizeStart={startSidebarResize}
        pinnedModels={pinnedModels}
        onTogglePin={togglePin}
        onReorderPinned={reorderPinned}
        onFindStalePivots={() => setStalePivotsOpen(true)}
        pivotOverrides={pivotOverrides}
        onTogglePivotOverride={togglePivotOverride}
        viewLayout={viewLayout}
        onToggleViewLayout={() => setViewLayout(v => v === 'document' ? 'table' : 'document')}
        autoReloadSeconds={autoReloadSeconds}
        onSetAutoReload={setAutoReloadSeconds}
      />

      <div className="main">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          onClose={closeTab}
          onReorder={reorderTabs}
        />

        {!activeTab ? (
          <div className="no-model">
            <div className="no-model-illustration">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <h2>Select a model</h2>
            <p>Choose a model from the left sidebar to browse and edit your data.</p>
          </div>
        ) : (
          <>
            <Toolbar
              modelName={activeTab.modelName}
              totalCount={activeTab.total}
              selectedCount={activeTab.selectedRows.size}
              search={activeTab.search}
              onSearchChange={handleSearchChange}
              filterActive={activeTab.filterOpen || (activeTab.filters || []).some(f => f.value !== '' && f.value !== null && f.value !== undefined)}
              onToggleFilter={() => setFilterOpen(o => !o)}
              onAdd={() => setAddModalOpen(true)}
              onDeleteSelected={handleDeleteSelected}
              isPivot={isPivot}
              pivotMode={activeTab.pivotMode || 'off'}
              onCyclePivotMode={() => patchTab(activeTab.id, t => {
                const order = ['off', 'joined', 'cards']
                const cur = order.indexOf(t.pivotMode || 'off')
                return { pivotMode: order[(cur + 1) % order.length] }
              })}
              onEditSelected={() => setMassEditOpen(true)}
              onReload={handleReload}
              reloading={reloading}
            />

            {(activeTab.pivotMode && activeTab.pivotMode !== 'off') && isPivot ? (
              <PivotView
                pivotModel={activeTab.modelName}
                mode={activeTab.pivotMode}
                onToast={(m, t) => showToast(m, t || 'error')}
                viewLayout={viewLayout}
                docLabelWidth={docLabelWidth}
                onSetDocLabelWidth={setDocLabelWidth}
              />
            ) : (
              <>
            {activeTab.filterOpen && activeTab.schema && (
              <FilterBar
                baseSchema={activeTab.schema}
                filters={activeTab.filters || []}
                filterMode={activeTab.filterMode || 'AND'}
                onChange={setFilters}
                onModeChange={setFilterMode}
                onClear={clearFilters}
                onExport={() => setExportOpen(true)}
                schemaCache={schemaCache}
                ensureSchema={ensureSchema}
              />
            )}

            <div className="table-container">
              {activeTab.loading ? (
                <div className="loading-spinner">
                  <div className="spinner" />
                  Loading records…
                </div>
              ) : activeTab.records.length === 0 ? (
                <div className="table-empty">
                  <div className="table-empty-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                    </svg>
                  </div>
                  <h3>No records found</h3>
                  <p>{activeTab.search || (activeTab.filters || []).some(f => f.value) ? 'Try adjusting your search or filter.' : 'This model has no records yet.'}</p>
                </div>
              ) : activeTab.schema ? (
                <DataTable
                  fields={activeTab.schema.fields}
                  records={activeTab.records}
                  idField={idField}
                  selectedRows={activeTab.selectedRows}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAll}
                  onUpdateCell={handleUpdateCell}
                  onDeleteRow={handleDeleteRow}
                  onDuplicateRow={handleDuplicateRow}
                  orderBy={activeTab.orderBy}
                  orderDir={activeTab.orderDir}
                  onSort={handleSort}
                  onNavigateRelation={navigateToRelation}
                  models={models}
                  schemaCache={schemaCache}
                  ensureSchema={ensureSchema}
                  currentModelName={activeTab.modelName}
                  onNavigateThroughPivot={navigateThroughPivot}
                  layout={viewLayout}
                  docLabelWidth={docLabelWidth}
                  onSetDocLabelWidth={setDocLabelWidth}
                />
              ) : null}
            </div>

            <Pagination
              page={activeTab.page}
              pageSize={activeTab.pageSize}
              total={activeTab.total}
              onPage={p => patchTab(activeTab.id, { page: p, selectedRows: new Set() })}
              onPageSize={ps => patchTab(activeTab.id, { pageSize: ps, page: 1 })}
            />
              </>
            )}
          </>
        )}
      </div>

      {addModalOpen && activeTab?.schema && (
        <AddRecordModal
          modelName={activeTab.modelName}
          fields={activeTab.schema.fields}
          onSubmit={handleAddRecord}
          onClose={() => { setAddModalOpen(false); setDuplicateSource(null) }}
          saving={saving}
          initialValues={duplicateSource?.values || null}
          title={duplicateSource ? `Duplicate row in ${activeTab.modelName}` : undefined}
        />
      )}

      {exportOpen && activeTab?.schema && (
        <ExportQueryModal
          modelName={activeTab.modelName}
          filters={activeTab.filters || []}
          filterMode={activeTab.filterMode || 'AND'}
          search={activeTab.search}
          baseSchema={activeTab.schema}
          schemaCache={schemaCache}
          orderBy={activeTab.orderBy}
          orderDir={activeTab.orderDir}
          page={activeTab.page}
          pageSize={activeTab.pageSize}
          onClose={() => setExportOpen(false)}
        />
      )}

      {stalePivotsOpen && (
        <StalePivotsModal
          onClose={() => setStalePivotsOpen(false)}
          onJump={(pivotModel, idField, id) => {
            setStalePivotsOpen(false)
            openTab(pivotModel, [{ path: [idField], op: 'equals', value: String(id) }], { newTab: true })
          }}
        />
      )}

      {massEditOpen && activeTab?.schema && activeTab.selectedRows.size > 0 && (
        <MassEditModal
          modelName={activeTab.modelName}
          fields={activeTab.schema.fields}
          selectedCount={activeTab.selectedRows.size}
          onSubmit={handleMassEdit}
          onClose={() => setMassEditOpen(false)}
          saving={massEditSaving}
        />
      )}

      {deleteRequest && (
        <ConfirmDeleteModal
          title={deleteRequest.kind === 'bulk'
            ? `Delete ${deleteRequest.ids.length} record${deleteRequest.ids.length !== 1 ? 's' : ''}?`
            : 'Delete this record?'}
          message={deleteRequest.kind === 'bulk'
            ? `You're about to delete ${deleteRequest.ids.length} record${deleteRequest.ids.length !== 1 ? 's' : ''} from ${activeTab?.modelName}.`
            : `You're about to delete one record from ${activeTab?.modelName}.`}
          busy={deleteRequest.busy}
          onCancel={() => !deleteRequest.busy && setDeleteRequest(null)}
          onConfirm={performDelete}
        />
      )}

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
