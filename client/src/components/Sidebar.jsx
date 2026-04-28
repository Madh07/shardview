import { useEffect, useMemo, useState } from 'react'

const MODEL_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
  '#f97316', '#06b6d4', '#84cc16', '#e11d48',
]

function getColor(index) {
  return MODEL_COLORS[index % MODEL_COLORS.length]
}

function ModelIcon({ name, color }) {
  return (
    <div className="sidebar-model-icon" style={{ background: color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function PinIcon({ filled }) {
  return filled ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5"/>
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5"/>
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
    </svg>
  )
}

function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    function onDoc(e) {
      // Close on any click outside (we stop propagation on item clicks)
      onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    // Defer attach so the right-click that opened us doesn't immediately close
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('contextmenu', onDoc)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('contextmenu', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp to viewport
  const margin = 8
  const W = 220, H = items.length * 32 + 8
  const left = Math.min(x, window.innerWidth - W - margin)
  const top = Math.min(y, window.innerHeight - H - margin)

  return (
    <div
      className="context-menu"
      style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className="context-menu-item"
          onClick={() => { item.onClick(); onClose() }}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          <span>{item.label}</span>
          {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  )
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export default function Sidebar({
  models,
  selectedModel,
  onSelect,
  loading,
  search,
  onSearchChange,
  theme,
  onToggleTheme,
  width,
  onResizeStart,
  pinnedModels = [],
  onTogglePin,
  onReorderPinned,
  onFindStalePivots,
}) {
  const [menu, setMenu] = useState(null)  // { x, y, model }
  const [pinDragName, setPinDragName] = useState(null)
  const [pinDragOverName, setPinDragOverName] = useState(null)

  const filtered = useMemo(() => {
    if (!search) return models
    const q = search.toLowerCase()
    return models.filter(m => m.name.toLowerCase().includes(q))
  }, [models, search])

  const pinnedSet = useMemo(() => new Set(pinnedModels), [pinnedModels])

  const ordered = useMemo(() => {
    const pinned = filtered.filter(m => pinnedSet.has(m.name))
    const rest = filtered.filter(m => !pinnedSet.has(m.name))
    // Pinned in pinnedModels order
    pinned.sort((a, b) => pinnedModels.indexOf(a.name) - pinnedModels.indexOf(b.name))
    return { pinned, rest }
  }, [filtered, pinnedSet, pinnedModels])

  function handleClick(e, model) {
    e.preventDefault()
    const newTab = e.metaKey || e.ctrlKey
    onSelect(model.name, { newTab })
  }

  function handleAuxClick(e, model) {
    if (e.button === 1) {
      e.preventDefault()
      onSelect(model.name, { newTab: true })
    }
  }

  function handleContextMenu(e, model) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, model })
  }

  function renderModel(model, opts = {}) {
    const { draggable = false } = opts
    const originalIdx = models.indexOf(model)
    const isPinned = pinnedSet.has(model.name)

    const dragProps = draggable ? {
      draggable: true,
      onDragStart: (e) => {
        setPinDragName(model.name)
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', model.name) } catch {}
      },
      onDragOver: (e) => {
        if (!pinDragName) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (pinDragOverName !== model.name) setPinDragOverName(model.name)
      },
      onDragLeave: () => {
        if (pinDragOverName === model.name) setPinDragOverName(null)
      },
      onDrop: (e) => {
        e.preventDefault()
        const fromIdx = pinnedModels.indexOf(pinDragName)
        const toIdx = pinnedModels.indexOf(model.name)
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) onReorderPinned?.(fromIdx, toIdx)
        setPinDragName(null)
        setPinDragOverName(null)
      },
      onDragEnd: () => { setPinDragName(null); setPinDragOverName(null) },
    } : {}

    const dragClass = draggable
      ? `${pinDragName === model.name ? 'dragging' : ''} ${pinDragOverName === model.name && pinDragName !== model.name ? 'drag-over' : ''}`
      : ''

    return (
      <button
        key={model.name}
        className={`sidebar-model-btn ${selectedModel === model.name ? 'active' : ''} ${dragClass}`}
        onClick={e => handleClick(e, model)}
        onAuxClick={e => handleAuxClick(e, model)}
        onContextMenu={e => handleContextMenu(e, model)}
        title={model.isPivot ? `${model.name} — pivot/join table` : model.name}
        {...dragProps}
      >
        <ModelIcon name={model.name} color={getColor(originalIdx)} />
        <div className="sidebar-model-info">
          <div className="sidebar-model-name">
            {model.name}
            {model.isPivot && <span className="sidebar-pivot-badge">PIVOT</span>}
          </div>
          <div className="sidebar-model-count">
            {model.count} {model.count === 1 ? 'record' : 'records'}
          </div>
        </div>
        {isPinned && (
          <span className="sidebar-model-pin" title="Pinned">
            <PinIcon filled />
          </span>
        )}
      </button>
    )
  }

  return (
    <aside className="sidebar" style={width ? { width } : undefined}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">ShardView</span>
          <span className="sidebar-logo-subtitle">Database Browser</span>
        </div>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>

      <div className="sidebar-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Search models…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="sidebar-search-clear"
            onClick={() => onSearchChange('')}
          >×</button>
        )}
      </div>

      <div className="sidebar-models">
        {loading ? (
          <div style={{ padding: '20px 12px', color: 'var(--sidebar-text-muted)', fontSize: 12 }}>Loading models…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '20px 12px', color: 'var(--sidebar-text-muted)', fontSize: 12 }}>
            {search ? 'No matches' : 'No models found'}
          </div>
        ) : (
          <>
            {ordered.pinned.length > 0 && (
              <>
                <div className="sidebar-section-label sidebar-subsection">Pinned</div>
                {ordered.pinned.map(m => renderModel(m, { draggable: true }))}
                <div className="sidebar-section-label sidebar-subsection">Models</div>
              </>
            )}
            {ordered.rest.map(m => renderModel(m))}
          </>
        )}
      </div>

      {onFindStalePivots && (
        <button
          type="button"
          className="sidebar-stale-btn"
          onClick={onFindStalePivots}
          title="Scan all pivot models for rows with missing or orphaned FK references"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>Find stale pivots</span>
        </button>
      )}

      {onResizeStart && (
        <div
          className="sidebar-resizer"
          onMouseDown={onResizeStart}
          title="Drag to resize"
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>
                </svg>
              ),
              label: 'Open',
              shortcut: 'click',
              onClick: () => onSelect(menu.model.name, { newTab: false }),
            },
            {
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="8" height="8" rx="1"/>
                  <rect x="13" y="13" width="8" height="8" rx="1"/>
                </svg>
              ),
              label: 'Open in new tab',
              shortcut: isMac ? '⌘ click' : 'Ctrl click',
              onClick: () => onSelect(menu.model.name, { newTab: true }),
            },
            {
              icon: <PinIcon filled={pinnedSet.has(menu.model.name)} />,
              label: pinnedSet.has(menu.model.name) ? 'Unpin' : 'Pin to top',
              onClick: () => onTogglePin?.(menu.model.name),
            },
          ]}
        />
      )}
    </aside>
  )
}
