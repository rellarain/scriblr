import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { OutlineNode, OutlineNodeKind } from '../../types'
import AddChildForm from './AddChildForm'
import { kindsDeeperThan } from './outlineTree'

interface Props {
  node: OutlineNode
  depth: number
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onAddChild: (parentId: string, kind: OutlineNodeKind, title: string) => void
}

function OutlineNodeRow({ node, depth, onRename, onDelete, onAddChild }: Props) {
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
    <div className="outline-node-wrap">
      <div
        ref={setNodeRef}
        style={style}
        className={`outline-node outline-node--${node.kind}${isDragging ? ' is-dragging' : ''}`}
      >
        <span className="outline-node__handle" {...attributes} {...listeners}>
          ⠿
        </span>
        <span className="outline-node__kind">{node.kind}</span>
        <input
          className="outline-node__title"
          value={node.title}
          onChange={(e) => onRename(node.id, e.target.value)}
        />
        {childKinds.length > 0 && (
          <button
            type="button"
            className="outline-node__add-toggle"
            onClick={() => setAddOpen((v) => !v)}
          >
            +
          </button>
        )}
        <button type="button" className="outline-node__delete" onClick={() => onDelete(node.id)}>
          ✕
        </button>
      </div>

      {addOpen && (
        <div style={{ marginLeft: `${(depth + 1) * 1.25}rem` }}>
          <AddChildForm
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

export default OutlineNodeRow
