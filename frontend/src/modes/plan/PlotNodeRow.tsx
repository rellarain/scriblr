import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextKindInLevels } from '../../lib/nodeTree'
import { PLOT_KIND_ORDER } from '../../types'
import type { OutlineNode, PlotNode, PlotNodeKind } from '../../types'

interface Props {
  node: PlotNode
  levels: PlotNodeKind[]
  hasChildren: boolean
  collapsed: boolean
  onToggleCollapse: (nodeId: string) => void
  moments: OutlineNode[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: PlotNode) => void
  onAddChild: (node: PlotNode) => void
  onNextSibling: (node: PlotNode) => void
  onPreviousSibling: (node: PlotNode) => void
  onEnter: (node: PlotNode) => void
  onNavigateToParent: (node: PlotNode) => void
  onBackspaceDelete: (node: PlotNode) => void
  onUpdatePlotpoint: (nodeId: string, patch: { body?: string; assignedMomentId?: string | null }) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
}

function PlotNodeRow({
  node,
  levels,
  hasChildren,
  collapsed,
  onToggleCollapse,
  moments,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
  onUpdatePlotpoint,
  registerInput,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const canAddChild = nextKindInLevels(levels, node.kind, PLOT_KIND_ORDER) !== undefined

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

  return (
    <div className="plot-node-wrap">
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
          <span className="plot-node__kind">{node.kind}</span>
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
        <button type="button" className="plot-node__delete" onClick={() => onDelete(node)}>
          ✕
        </button>
      </div>

      {node.kind === 'plotpoint' && (
        <div className="plot-node__plotpoint-fields">
          <textarea
            placeholder="What happens…"
            value={node.body}
            onChange={(e) => onUpdatePlotpoint(node.id, { body: e.target.value })}
          />
          <select
            value={node.assignedMomentId ?? ''}
            onChange={(e) => onUpdatePlotpoint(node.id, { assignedMomentId: e.target.value || null })}
          >
            <option value="">Not assigned to a moment</option>
            {moments.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

export default PlotNodeRow
