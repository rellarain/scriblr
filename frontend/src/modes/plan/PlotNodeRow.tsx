import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextKindInLevels } from '../../lib/nodeTree'
import { PLOT_KIND_ORDER } from '../../types'
import type { OutlineNode, PlotNode, PlotNodeKind } from '../../types'

interface Props {
  node: PlotNode
  depth: number
  levels: PlotNodeKind[]
  moments: OutlineNode[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onTab: (node: PlotNode) => void
  onEnter: (node: PlotNode) => void
  onUpdatePlotpoint: (nodeId: string, patch: { body?: string; assignedMomentId?: string | null }) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
}

function PlotNodeRow({
  node,
  depth,
  levels,
  moments,
  onRename,
  onDelete,
  onTab,
  onEnter,
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
    marginLeft: `${depth * 1.25}rem`,
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      onTab(node)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onEnter(node)
    }
  }

  return (
    <div className="plot-node-wrap">
      <div
        ref={setNodeRef}
        style={style}
        className={`plot-node plot-node--${node.kind}${isDragging ? ' is-dragging' : ''}`}
      >
        <span className="plot-node__handle" {...attributes} {...listeners}>
          ⠿
        </span>
        <span className="plot-node__kind">{node.kind}</span>
        <input
          ref={(el) => registerInput(node.id, el)}
          className="plot-node__title"
          value={node.title}
          placeholder="Untitled"
          onChange={(e) => onRename(node.id, e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {canAddChild && (
          <button type="button" className="plot-node__add-toggle" onClick={() => onTab(node)}>
            +
          </button>
        )}
        <button type="button" className="plot-node__delete" onClick={() => onDelete(node.id)}>
          ✕
        </button>
      </div>

      {node.kind === 'plotpoint' && (
        <div className="plot-node__plotpoint-fields" style={{ marginLeft: `${depth * 1.25}rem` }}>
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
