import type { OutlineNode } from '../../types'
import { subtreeOrder } from '../outline/outlineTree'

interface Props {
  nodes: OutlineNode[]
  chapterId: string
  selectedMomentId?: string
  onSelect: (momentId: string) => void
}

function relativeDepth(nodes: OutlineNode[], nodeId: string, rootId: string): number {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let depth = 0
  let current = byId.get(nodeId)
  while (current && current.parentId && current.parentId !== rootId) {
    depth++
    current = byId.get(current.parentId)
  }
  return depth
}

// Read-only navigation within a selected chapter: scene headers + moment
// rows, click a moment to open it in the editor. No add/delete/flag/drag --
// structural editing belongs in Plan mode, this is purely for picking what
// to draft next.
function ChapterOutline({ nodes, chapterId, selectedMomentId, onSelect }: Props) {
  const ordered = subtreeOrder(nodes, chapterId)

  return (
    <div className="chapter-outline">
      {ordered.map((node) => {
        const depth = relativeDepth(nodes, node.id, chapterId)
        if (node.kind === 'moment') {
          return (
            <button
              key={node.id}
              type="button"
              style={{ marginLeft: `${depth * 0.75}rem` }}
              className={`chapter-outline__moment${node.id === selectedMomentId ? ' is-active' : ''}`}
              onClick={() => onSelect(node.id)}
            >
              {node.title || 'Untitled'}
            </button>
          )
        }
        return (
          <p key={node.id} style={{ marginLeft: `${depth * 0.75}rem` }} className="chapter-outline__header">
            {node.title || 'Untitled'}
          </p>
        )
      })}
      {ordered.length === 0 && <p className="chapter-outline__empty">No moments yet in this chapter.</p>}
    </div>
  )
}

export default ChapterOutline
