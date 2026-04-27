import { useState } from 'react'

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onReorder }) {
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  if (tabs.length === 0) return null

  function handleDragStart(e, id) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch {}
  }

  function handleDragOver(e, id) {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverId !== id) setDragOverId(id)
  }

  function handleDrop(e, targetId) {
    e.preventDefault()
    const fromIdx = tabs.findIndex(t => t.id === dragId)
    const toIdx = tabs.findIndex(t => t.id === targetId)
    if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) onReorder?.(fromIdx, toIdx)
    setDragId(null)
    setDragOverId(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setDragOverId(null)
  }

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''} ${dragId === tab.id ? 'dragging' : ''} ${dragOverId === tab.id && dragId !== tab.id ? 'drag-over' : ''}`}
          draggable
          onDragStart={e => handleDragStart(e, tab.id)}
          onDragOver={e => handleDragOver(e, tab.id)}
          onDragLeave={() => dragOverId === tab.id && setDragOverId(null)}
          onDrop={e => handleDrop(e, tab.id)}
          onDragEnd={handleDragEnd}
          onClick={() => onSelect(tab.id)}
          onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onClose(tab.id) } }}
          title={tab.modelName}
        >
          <span className="tab-name">{tab.modelName}</span>
          <button
            type="button"
            className="tab-close"
            onClick={e => { e.stopPropagation(); onClose(tab.id) }}
            title="Close tab"
          >×</button>
        </div>
      ))}
    </div>
  )
}
