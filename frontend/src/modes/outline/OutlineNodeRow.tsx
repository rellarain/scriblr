import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import NodeFlagControl from '../../components/shared/NodeFlagControl'
import { nextKindInLevels } from '../../lib/nodeTree'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { NodeFlag, OutlineNode, OutlineNodeKind, PlotNode } from '../../types'

interface Props {
  node: OutlineNode
  levels: OutlineNodeKind[]
  hasChildren: boolean
  childCount: number
  collapsed: boolean
  onToggleCollapse: (nodeId: string) => void
  assignedPlotpoints: PlotNode[]
  onAssignPlotpoint: (plotpointId: string, momentId: string) => void
  onUnassignPlotpoint: (plotpointId: string) => void
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: OutlineNode) => void
  onAddChild: (node: OutlineNode) => void
  onNextSibling: (node: OutlineNode) => void
  onPreviousSibling: (node: OutlineNode) => void
  onEnter: (node: OutlineNode) => void
  onNavigateToParent: (node: OutlineNode) => void
  onBackspaceDelete: (node: OutlineNode) => void
  onReparentNode: (nodeId: string, newParentId: string) => void
  onSetFlag: (nodeId: string, flag: NodeFlag | null) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
}

function OutlineNodeRow({
  node,
  levels,
  hasChildren,
  childCount,
  collapsed,
  onToggleCollapse,
  assignedPlotpoints,
  onAssignPlotpoint,
  onUnassignPlotpoint,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
  onReparentNode,
  onSetFlag,
  registerInput,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })
  const [isDropTarget, setIsDropTarget] = useState(false)

  const canAddChild = nextKindInLevels(levels, node.kind, OUTLINE_KIND_ORDER) !== undefined
  const isMoment = node.kind === 'moment'

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
    if ((e.target as HTMLElement).closest('.outline-node__handle')) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('application/x-outline-node-id', node.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function acceptsDrag(e: React.DragEvent<HTMLDivElement>) {
    const types = e.dataTransfer.types
    return types.includes('application/x-outline-node-id') || (isMoment && types.includes('application/x-plotpoint-id'))
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (acceptsDrag(e)) e.preventDefault()
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (acceptsDrag(e)) {
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
    const plotpointId = e.dataTransfer.getData('application/x-plotpoint-id')
    if (isMoment && plotpointId) {
      onAssignPlotpoint(plotpointId, node.id)
      return
    }
    const draggedNodeId = e.dataTransfer.getData('application/x-outline-node-id')
    if (draggedNodeId && draggedNodeId !== node.id) {
      onReparentNode(draggedNodeId, node.id)
    }
  }

  return (
    <div className="outline-node-wrap">
      <div
        ref={setNodeRef}
        style={style}
        draggable
        className={`outline-node outline-node--${node.kind}${isDragging ? ' is-dragging' : ''}${
          isDropTarget ? ' is-drop-target' : ''
        }`}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className={`outline-node__toggle${hasChildren ? '' : ' outline-node__toggle--empty'}`}
          onClick={() => hasChildren && onToggleCollapse(node.id)}
          tabIndex={-1}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {hasChildren ? (collapsed ? '▸' : '▾') : ''}
        </button>
        <span className="outline-node__handle" {...attributes} {...listeners}>
          ⠿
        </span>
        <div className="outline-node__main">
          <span className="outline-node__kind">
            {node.kind}
            {childCount > 0 && (
              <span className="outline-node__count">
                {' '}
                · {childCount} {childCount === 1 ? 'child' : 'children'}
              </span>
            )}
          </span>
          <input
            ref={(el) => registerInput(node.id, el)}
            className="outline-node__title"
            value={node.title}
            placeholder="Untitled"
            onChange={(e) => onRename(node.id, e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <NodeFlagControl flag={node.flag} onSetFlag={(flag) => onSetFlag(node.id, flag)} />
        {canAddChild && (
          <button type="button" className="outline-node__add-toggle" onClick={() => onAddChild(node)}>
            +
          </button>
        )}
        <button type="button" className="outline-node__delete" onClick={() => onDelete(node)}>
          ✕
        </button>
      </div>

      {isMoment && assignedPlotpoints.length > 0 && (
        <div className="outline-node__plotpoints">
          {assignedPlotpoints.map((p) => (
            <div key={p.id} className="outline-node__plotpoint-chip">
              <span className="outline-node__plotpoint-chip-text">
                <span className="outline-node__plotpoint-chip-title">{p.title || 'Untitled'}</span>
                {p.body && <span className="outline-node__plotpoint-chip-description"> — {p.body}</span>}
              </span>
              <button
                type="button"
                className="outline-node__plotpoint-unlink"
                onClick={() => onUnassignPlotpoint(p.id)}
                title="Unlink from this moment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default OutlineNodeRow
