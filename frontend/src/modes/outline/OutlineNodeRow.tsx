import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextKindInLevels } from '../../lib/nodeTree'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineNodeKind } from '../../types'

interface Props {
  node: OutlineNode
  depth: number
  levels: OutlineNodeKind[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onTab: (node: OutlineNode) => void
  onEnter: (node: OutlineNode) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
}

function OutlineNodeRow({
  node,
  depth,
  levels,
  onRename,
  onDelete,
  onTab,
  onEnter,
  registerInput,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const canAddChild = nextKindInLevels(levels, node.kind, OUTLINE_KIND_ORDER) !== undefined

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
        ref={(el) => registerInput(node.id, el)}
        className="outline-node__title"
        value={node.title}
        placeholder="Untitled"
        onChange={(e) => onRename(node.id, e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {canAddChild && (
        <button type="button" className="outline-node__add-toggle" onClick={() => onTab(node)}>
          +
        </button>
      )}
      <button type="button" className="outline-node__delete" onClick={() => onDelete(node.id)}>
        ✕
      </button>
    </div>
  )
}

export default OutlineNodeRow
