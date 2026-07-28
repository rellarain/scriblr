import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { OutlineNode } from '../../types'

interface Props {
  node: OutlineNode
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
}

function OutlineNodeRow({ node, onRename, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`outline-node outline-node--${node.kind}${isDragging ? ' is-dragging' : ''}`}
    >
      <span className="outline-node__handle" {...attributes} {...listeners}>
        ⠿
      </span>
      <input
        className="outline-node__title"
        value={node.title}
        onChange={(e) => onRename(node.id, e.target.value)}
      />
      <button type="button" className="outline-node__delete" onClick={() => onDelete(node.id)}>
        ✕
      </button>
    </div>
  )
}

export default OutlineNodeRow
