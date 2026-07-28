import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { OutlineNode, PlotNode, PlotNodeKind } from '../../types'
import PlotNodeRow from './PlotNodeRow'
import { getChildren } from './plotTree'

interface Props {
  nodes: PlotNode[]
  parentId: string | null
  depth: number
  moments: OutlineNode[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (nodeId: string) => void
  onAddChild: (parentId: string, kind: PlotNodeKind, title: string) => void
  onUpdatePlotpoint: (nodeId: string, patch: { body?: string; assignedMomentId?: string | null }) => void
  onReorder: (orderedIds: string[]) => void
}

function PlotTreeView({
  nodes,
  parentId,
  depth,
  moments,
  onRename,
  onDelete,
  onAddChild,
  onUpdatePlotpoint,
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
    onReorder(ordered)
  }

  if (children.length === 0) return null

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {children.map((child) => (
          <div key={child.id}>
            <PlotNodeRow
              node={child}
              depth={depth}
              moments={moments}
              onRename={onRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onUpdatePlotpoint={onUpdatePlotpoint}
            />
            <PlotTreeView
              nodes={nodes}
              parentId={child.id}
              depth={depth + 1}
              moments={moments}
              onRename={onRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onUpdatePlotpoint={onUpdatePlotpoint}
              onReorder={onReorder}
            />
          </div>
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default PlotTreeView
