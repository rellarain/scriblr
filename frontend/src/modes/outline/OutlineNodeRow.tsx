import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextKindInLevels } from '../../lib/nodeTree'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineNodeKind } from '../../types'

interface Props {
  node: OutlineNode
  levels: OutlineNodeKind[]
  hasChildren: boolean
  collapsed: boolean
  onToggleCollapse: (nodeId: string) => void
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: OutlineNode) => void
  onAddChild: (node: OutlineNode) => void
  onNextSibling: (node: OutlineNode) => void
  onPreviousSibling: (node: OutlineNode) => void
  onEnter: (node: OutlineNode) => void
  onNavigateToParent: (node: OutlineNode) => void
  onBackspaceDelete: (node: OutlineNode) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
}

function OutlineNodeRow({
  node,
  levels,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
  registerInput,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const canAddChild = nextKindInLevels(levels, node.kind, OUTLINE_KIND_ORDER) !== undefined

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
    <div
      ref={setNodeRef}
      style={style}
      className={`outline-node outline-node--${node.kind}${isDragging ? ' is-dragging' : ''}`}
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
        <span className="outline-node__kind">{node.kind}</span>
        <input
          ref={(el) => registerInput(node.id, el)}
          className="outline-node__title"
          value={node.title}
          placeholder="Untitled"
          onChange={(e) => onRename(node.id, e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {canAddChild && (
        <button type="button" className="outline-node__add-toggle" onClick={() => onAddChild(node)}>
          +
        </button>
      )}
      <button type="button" className="outline-node__delete" onClick={() => onDelete(node)}>
        ✕
      </button>
    </div>
  )
}

export default OutlineNodeRow
