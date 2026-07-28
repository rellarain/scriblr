import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { OutlineNode, PlotNode, PlotNodeKind } from '../../types'
import { kindsDeeperThan } from './plotTree'
import PlotAddChildForm from './PlotAddChildForm'

interface Props {
  node: PlotNode
  depth: number
  moments: OutlineNode[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onAddChild: (parentId: string, kind: PlotNodeKind, title: string) => void
  onUpdatePlotpoint: (nodeId: string, patch: { body?: string; assignedMomentId?: string | null }) => void
}

function PlotNodeRow({
  node,
  depth,
  moments,
  onRename,
  onDelete,
  onAddChild,
  onUpdatePlotpoint,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const [addOpen, setAddOpen] = useState(false)
  const childKinds = kindsDeeperThan(node.kind)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: `${depth * 1.25}rem`,
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
          className="plot-node__title"
          value={node.title}
          onChange={(e) => onRename(node.id, e.target.value)}
        />
        {childKinds.length > 0 && (
          <button type="button" className="plot-node__add-toggle" onClick={() => setAddOpen((v) => !v)}>
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

      {addOpen && (
        <div style={{ marginLeft: `${(depth + 1) * 1.25}rem` }}>
          <PlotAddChildForm
            kindOptions={childKinds}
            onSubmit={(kind, title) => {
              onAddChild(node.id, kind, title)
              setAddOpen(false)
            }}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

export default PlotNodeRow
