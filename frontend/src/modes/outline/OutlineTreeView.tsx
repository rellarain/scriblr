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
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onAddChild: (parentId: string, kind: OutlineNodeKind, title: string) => void
  onReorder: (parentId: string, orderedIds: string[]) => void
}

function OutlineTreeView({
  nodes,
  parentId,
  depth,
  onRename,
  onDelete,
  onAddChild,
  onReorder,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const children = getChildren(nodes, parentId)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || parentId === null) return
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
              onRename={onRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
            <OutlineTreeView
              nodes={nodes}
              parentId={child.id}
              depth={depth + 1}
              onRename={onRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onReorder={onReorder}
            />
          </div>
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default OutlineTreeView
