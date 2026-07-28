import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { OutlineNode, OutlineNodeKind } from '../../types'
import OutlineNodeRow from './OutlineNodeRow'
import { getChildren } from './outlineTree'

interface Props {
  nodes: OutlineNode[]
  parentId: string | null
  depth: number
  levels: OutlineNodeKind[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onTab: (node: OutlineNode) => void
  onEnter: (node: OutlineNode) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
  onReorder: (parentId: string | null, orderedIds: string[]) => void
}

function OutlineTreeView({
  nodes,
  parentId,
  depth,
  levels,
  onRename,
  onDelete,
  onTab,
  onEnter,
  registerInput,
  onReorder,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const children = getChildren(nodes, parentId)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ordered = children.map((c) => c.id)
    const oldIndex = ordered.indexOf(String(active.id))
    const newIndex = ordered.indexOf(String(over.id))
    ordered.splice(newIndex, 0, ordered.splice(oldIndex, 1)[0])
    onReorder(parentId, ordered)
  }

  if (children.length === 0) return null

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {children.map((child) => (
          <div key={child.id}>
            <OutlineNodeRow
              node={child}
              depth={depth}
              levels={levels}
              onRename={onRename}
              onDelete={onDelete}
              onTab={onTab}
              onEnter={onEnter}
              registerInput={registerInput}
            />
            <OutlineTreeView
              nodes={nodes}
              parentId={child.id}
              depth={depth + 1}
              levels={levels}
              onRename={onRename}
              onDelete={onDelete}
              onTab={onTab}
              onEnter={onEnter}
              registerInput={registerInput}
              onReorder={onReorder}
            />
          </div>
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default OutlineTreeView
