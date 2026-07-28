import type { OutlineNode } from '../../types'
import { depthOf, documentOrder } from '../../modes/outline/outlineTree'

interface Props {
  nodes: OutlineNode[]
  selectedMomentId?: string
  onSelect: (momentId: string) => void
}

function MomentPickerSidebar({ nodes, selectedMomentId, onSelect }: Props) {
  const ordered = documentOrder(nodes)

  return (
    <aside className="moment-picker">
      {ordered.map((node) => {
        const depth = depthOf(nodes, node.id)
        if (node.kind === 'moment') {
          return (
            <button
              key={node.id}
              type="button"
              style={{ marginLeft: `${depth * 0.75}rem` }}
              className={
                node.id === selectedMomentId
                  ? 'moment-picker__moment is-active'
                  : 'moment-picker__moment'
              }
              onClick={() => onSelect(node.id)}
            >
              {node.title}
            </button>
          )
        }
        return (
          <p key={node.id} style={{ marginLeft: `${depth * 0.75}rem` }} className="moment-picker__header">
            {node.title}
          </p>
        )
      })}
      {ordered.length === 0 && <p>No structure yet. Add some in Plan mode first.</p>}
    </aside>
  )
}

export default MomentPickerSidebar
