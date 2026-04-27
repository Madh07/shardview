import { useState, useCallback } from 'react'

export default function Toolbar({
  modelName,
  totalCount,
  selectedCount,
  search,
  onSearchChange,
  filterActive,
  onToggleFilter,
  onAdd,
  onDeleteSelected,
  isPivot,
  pivotMode,
  onCyclePivotMode,
  onEditSelected,
}) {
  const pivotLabels = { off: 'Pivot view', joined: 'Pivot: joined', cards: 'Pivot: cards' }
  const pivotIsOn = pivotMode && pivotMode !== 'off'
  return (
    <div className="toolbar">
      <span className="toolbar-model-name">{modelName}</span>
      <span className="toolbar-count">{totalCount} record{totalCount !== 1 ? 's' : ''}</span>

      <div className="toolbar-sep" />

      <div className="toolbar-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Search records…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, padding: 0, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>

      {isPivot && (
        <button
          className={`toolbar-filter-btn ${pivotIsOn ? 'active' : ''}`}
          onClick={onCyclePivotMode}
          title="Cycle pivot views: off → joined → cards"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="18" cy="18" r="3"/>
            <path d="M9 6h6a3 3 0 0 1 3 3v6"/>
            <path d="M15 18H9a3 3 0 0 1-3-3V9"/>
          </svg>
          {pivotLabels[pivotMode || 'off']}
        </button>
      )}

      <button
        className={`toolbar-filter-btn ${filterActive ? 'active' : ''}`}
        onClick={onToggleFilter}
        title="Toggle filter"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        Filter
        {filterActive && <span style={{ fontSize: 10, background: '#5664d2', color: 'white', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>•</span>}
      </button>

      {selectedCount > 0 && (
        <>
          <button className="toolbar-edit-btn" onClick={onEditSelected} title="Mass edit selected records">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Edit {selectedCount}
          </button>
          <button className="toolbar-delete-btn" onClick={onDeleteSelected}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Delete {selectedCount}
          </button>
        </>
      )}

      <button className="toolbar-add-btn" onClick={onAdd}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add record
      </button>
    </div>
  )
}
