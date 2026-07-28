import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { OutlineNode, OutlineNodeKind, PlotNode } from '../../types'
import { plotpointsForMoment } from '../plan/plotTree'
import OutlineNodeRow from './OutlineNodeRow'
import { getChildren } from './outlineTree'

interface Props {
  nodes: OutlineNode[]
  parentId: string | null
  levels: OutlineNodeKind[]
  collapsedIds: Set<string>
  onToggleCollapse: (nodeId: string) => void
  plotNodes: PlotNode[]
  onAssignPlotpoint: (plotpointId: string, momentId: string) => void
  onUnassignPlotpoint: (plotpointId: string) => void
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: OutlineNode) => void
  onAddChild: (node: OutlineNode) => void
  onNextSibling: (node: OutlineNode) => void
  onPreviousSibling: (node: OutlineNode) => void
  onEnter: (node: OutlineNode) => void
  onNavigateToParent: (node: OutlineNode) => void
  onBackspaceDelete: (node: OutlineNode) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
  onReorder: (parentId: string | null, orderedIds: string[]) => void
}

function OutlineTreeView({
  nodes,
  parentId,
  levels,
  collapsedIds,
  onToggleCollapse,
  plotNodes,
  onAssignPlotpoint,
  onUnassignPlotpoint,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
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
        {children.map((child) => {
          const childHasChildren = getChildren(nodes, child.id).length > 0
          const isCollapsed = collapsedIds.has(child.id)
          const assignedPlotpoints =
            child.kind === 'moment' ? plotpointsForMoment(plotNodes, child.id) : []
          return (
            <div key={child.id} className="outline-node__branch">
              <OutlineNodeRow
                node={child}
                levels={levels}
                hasChildren={childHasChildren}
                collapsed={isCollapsed}
                onToggleCollapse={onToggleCollapse}
                assignedPlotpoints={assignedPlotpoints}
                onAssignPlotpoint={onAssignPlotpoint}
                onUnassignPlotpoint={onUnassignPlotpoint}
                onRename={onRename}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onNextSibling={onNextSibling}
                onPreviousSibling={onPreviousSibling}
                onEnter={onEnter}
                onNavigateToParent={onNavigateToParent}
                onBackspaceDelete={onBackspaceDelete}
                registerInput={registerInput}
              />
              {childHasChildren && !isCollapsed && (
                <div className="outline-node__children">
                  <OutlineTreeView
                    nodes={nodes}
                    parentId={child.id}
                    levels={levels}
                    collapsedIds={collapsedIds}
                    onToggleCollapse={onToggleCollapse}
                    plotNodes={plotNodes}
                    onAssignPlotpoint={onAssignPlotpoint}
                    onUnassignPlotpoint={onUnassignPlotpoint}
                    onRename={onRename}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onNextSibling={onNextSibling}
                    onPreviousSibling={onPreviousSibling}
                    onEnter={onEnter}
                    onNavigateToParent={onNavigateToParent}
                    onBackspaceDelete={onBackspaceDelete}
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

export default OutlineTreeView
