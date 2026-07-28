import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { OutlineNode, PlotNode, PlotNodeKind } from '../../types'
import PlotNodeRow from './PlotNodeRow'
import { getChildren } from './plotTree'

interface Props {
  nodes: PlotNode[]
  parentId: string | null
  levels: PlotNodeKind[]
  collapsedIds: Set<string>
  onToggleCollapse: (nodeId: string) => void
  moments: OutlineNode[]
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: PlotNode) => void
  onAddChild: (node: PlotNode) => void
  onNextSibling: (node: PlotNode) => void
  onPreviousSibling: (node: PlotNode) => void
  onEnter: (node: PlotNode) => void
  onNavigateToParent: (node: PlotNode) => void
  onBackspaceDelete: (node: PlotNode) => void
  onUpdatePlotpoint: (nodeId: string, patch: { body?: string; assignedMomentId?: string | null }) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
  onReorder: (orderedIds: string[]) => void
}

function PlotTreeView({
  nodes,
  parentId,
  levels,
  collapsedIds,
  onToggleCollapse,
  moments,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
  onUpdatePlotpoint,
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
    onReorder(ordered)
  }

  if (children.length === 0) return null

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {children.map((child) => {
          const childHasChildren = getChildren(nodes, child.id).length > 0
          const isCollapsed = collapsedIds.has(child.id)
          return (
            <div key={child.id} className="plot-node__branch">
              <PlotNodeRow
                node={child}
                levels={levels}
                hasChildren={childHasChildren}
                collapsed={isCollapsed}
                onToggleCollapse={onToggleCollapse}
                moments={moments}
                onRename={onRename}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onNextSibling={onNextSibling}
                onPreviousSibling={onPreviousSibling}
                onEnter={onEnter}
                onNavigateToParent={onNavigateToParent}
                onBackspaceDelete={onBackspaceDelete}
                onUpdatePlotpoint={onUpdatePlotpoint}
                registerInput={registerInput}
              />
              {childHasChildren && !isCollapsed && (
                <div className="plot-node__children">
                  <PlotTreeView
                    nodes={nodes}
                    parentId={child.id}
                    levels={levels}
                    collapsedIds={collapsedIds}
                    onToggleCollapse={onToggleCollapse}
                    moments={moments}
                    onRename={onRename}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onNextSibling={onNextSibling}
                    onPreviousSibling={onPreviousSibling}
                    onEnter={onEnter}
                    onNavigateToParent={onNavigateToParent}
                    onBackspaceDelete={onBackspaceDelete}
                    onUpdatePlotpoint={onUpdatePlotpoint}
                    registerInput={registerInput}
                    onReorder={onReorder}
                  />
                </div>
              )}
            </div>
          )
        })}
      </SortableContext>
    </DndContext>
  )
}

export default PlotTreeView
