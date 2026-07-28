import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextKindInLevels } from '../../lib/nodeTree'
import { PLOT_KIND_ORDER } from '../../types'
import type { PlotCustomFieldDef, PlotNode, PlotNodeKind } from '../../types'

interface Props {
  node: PlotNode
  levels: PlotNodeKind[]
  hasChildren: boolean
  collapsed: boolean
  onToggleCollapse: (nodeId: string) => void
  plotpointTotal: number
  plotpointAssigned: number
  customFieldDefs: PlotCustomFieldDef[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: PlotNode) => void
  onAddChild: (node: PlotNode) => void
  onNextSibling: (node: PlotNode) => void
  onPreviousSibling: (node: PlotNode) => void
  onEnter: (node: PlotNode) => void
  onNavigateToParent: (node: PlotNode) => void
  onBackspaceDelete: (node: PlotNode) => void
  onUpdateBody: (nodeId: string, body: string) => void
  onAddCustomFieldDef: (categoryId: string) => void
  onRenameCustomFieldDef: (categoryId: string, fieldId: string, name: string) => void
  onRemoveCustomFieldDef: (categoryId: string, fieldId: string) => void
  onSetCustomFieldValue: (plotlineId: string, fieldId: string, value: string) => void
  onAddKeyword: (plotlineId: string, keyword: string) => void
  onRemoveKeyword: (plotlineId: string, keyword: string) => void
  onReparentNode: (nodeId: string, newParentId: string) => void
  showAssigned: boolean
  onToggleShowAssigned: (plotlineId: string) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
}

function PlotNodeRow({
  node,
  levels,
  hasChildren,
  collapsed,
  onToggleCollapse,
  plotpointTotal,
  plotpointAssigned,
  customFieldDefs,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
  onUpdateBody,
  onAddCustomFieldDef,
  onRenameCustomFieldDef,
  onRemoveCustomFieldDef,
  onSetCustomFieldValue,
  onAddKeyword,
  onRemoveKeyword,
  onReparentNode,
  showAssigned,
  onToggleShowAssigned,
  registerInput,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })
  const [keywordDraft, setKeywordDraft] = useState('')
  const [isDropTarget, setIsDropTarget] = useState(false)

  const canAddChild = nextKindInLevels(levels, node.kind, PLOT_KIND_ORDER) !== undefined
  const isPlotpoint = node.kind === 'plotpoint'
  const isCategory = node.kind === 'category'
  const isPlotline = node.kind === 'plotline'
  const showDescription = isPlotpoint && node.title.trim() !== ''
  const canDelete = !(isPlotpoint && node.assignedMomentId)

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (keywordDraft.trim()) {
        onAddKeyword(node.id, keywordDraft)
        setKeywordDraft('')
      }
    }
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) onPreviousSibling(node)
      else onNextSibling(node)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) onNavigateToParent(node)
      else onEnter(node)
    } else if (e.key === 'Delete' && e.shiftKey) {
      e.preventDefault()
      onDelete(node)
    } else if (e.key === 'Backspace' && node.title === '') {
      e.preventDefault()
      onBackspaceDelete(node)
    }
  }

  // Cross-tree assignment drag (plotpoint -> moment) and in-tree reparenting
  // drag (any node -> a shallower node, e.g. its parent's sibling) both use
  // native HTML5 DnD, separate from the dnd-kit sortable handle below which
  // reorders siblings. Bail out if the drag started on that handle so the
  // two systems don't fight.
  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('.plot-node__handle')) {
      e.preventDefault()
      return
    }
    if (isPlotpoint) {
      e.dataTransfer.setData('application/x-plotpoint-id', node.id)
    }
    e.dataTransfer.setData('application/x-plot-node-id', node.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes('application/x-plot-node-id')) e.preventDefault()
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes('application/x-plot-node-id')) {
      e.preventDefault()
      setIsDropTarget(true)
    }
  }

  function handleDragLeave() {
    setIsDropTarget(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDropTarget(false)
    const draggedNodeId = e.dataTransfer.getData('application/x-plot-node-id')
    if (draggedNodeId && draggedNodeId !== node.id) {
      onReparentNode(draggedNodeId, node.id)
    }
  }

  return (
    <div
      className={`plot-node-wrap${isPlotpoint ? ' plot-node-wrap--plotpoint' : ''}${
        isDropTarget ? ' is-drop-target' : ''
      }`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        ref={setNodeRef}
        style={style}
        className={`plot-node plot-node--${node.kind}${isDragging ? ' is-dragging' : ''}`}
      >
        <button
          type="button"
          className={`plot-node__toggle${hasChildren ? '' : ' plot-node__toggle--empty'}`}
          onClick={() => hasChildren && onToggleCollapse(node.id)}
          tabIndex={-1}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {hasChildren ? (collapsed ? '▸' : '▾') : ''}
        </button>
        <span className="plot-node__handle" {...attributes} {...listeners}>
          ⠿
        </span>
        <div className="plot-node__main">
          <span className="plot-node__kind">
            {node.kind}
            {isPlotline && (
              <span className="plot-node__count">
                {' '}
                · {plotpointAssigned}/{plotpointTotal} assigned
              </span>
            )}
            {isPlotline && plotpointAssigned > 0 && (
              <button
                type="button"
                className="plot-node__show-assigned-toggle"
                onClick={() => onToggleShowAssigned(node.id)}
              >
                {showAssigned ? 'Hide assigned' : 'Show assigned'}
              </button>
            )}
          </span>
          <input
            ref={(el) => registerInput(node.id, el)}
            className="plot-node__title"
            value={node.title}
            placeholder="Untitled"
            onChange={(e) => onRename(node.id, e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {canAddChild && (
          <button type="button" className="plot-node__add-toggle" onClick={() => onAddChild(node)}>
            +
          </button>
        )}
        {canDelete && (
          <button type="button" className="plot-node__delete" onClick={() => onDelete(node)}>
            ✕
          </button>
        )}
      </div>

      {showDescription && (
        <textarea
          className="plot-node__description"
          placeholder="What happens…"
          value={node.body}
          onChange={(e) => onUpdateBody(node.id, e.target.value)}
        />
      )}

      {isCategory && (
        <div className="plot-node__custom-fields-editor">
          <span className="plot-node__custom-fields-label">Plotline fields:</span>
          {node.customFieldDefs.map((f) => (
            <span key={f.id} className="plot-node__custom-field-chip">
              <input
                className="plot-node__custom-field-name"
                value={f.name}
                placeholder="Field name"
                onChange={(e) => onRenameCustomFieldDef(node.id, f.id, e.target.value)}
              />
              <button
                type="button"
                className="plot-node__custom-field-remove"
                onClick={() => onRemoveCustomFieldDef(node.id, f.id)}
                title="Remove field"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="plot-node__custom-field-add"
            onClick={() => onAddCustomFieldDef(node.id)}
          >
            + Add field
          </button>
        </div>
      )}

      {isPlotline && customFieldDefs.length > 0 && (
        <div className="plot-node__field-values">
          {customFieldDefs.map((f) => (
            <label key={f.id} className="plot-node__field-value">
              <span className="plot-node__field-value-label">{f.name || 'Untitled field'}</span>
              <input
                value={node.customFieldValues[f.id] ?? ''}
                onChange={(e) => onSetCustomFieldValue(node.id, f.id, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {isPlotline && (
        <div className="plot-node__keywords">
          {node.keywords.map((k) => (
            <span key={k} className="plot-node__keyword-chip">
              {k}
              <button
                type="button"
                className="plot-node__keyword-remove"
                onClick={() => onRemoveKeyword(node.id, k)}
                title="Remove keyword"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="plot-node__keyword-input"
            placeholder="Add keyword…"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
          />
        </div>
      )}
    </div>
  )
}

export default PlotNodeRow
