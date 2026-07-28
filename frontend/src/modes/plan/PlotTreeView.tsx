import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { PlotNode, PlotNodeKind } from '../../types'
import PlotNodeRow from './PlotNodeRow'
import { getChildren, getCustomFieldDefsForPlotline, plotpointCounts } from './plotTree'

interface Props {
  nodes: PlotNode[]
  parentId: string | null
  levels: PlotNodeKind[]
  collapsedIds: Set<string>
  onToggleCollapse: (nodeId: string) => void
  onRename: (nodeId: string, title: string) => void
  onDelete: (node: PlotNode) => void
  onAddChild: (node: PlotNode) => void
  onNextSibling: (node: PlotNode) => void
  onPreviousSibling: (node: PlotNode) => void
  onEnter: (node: PlotNode) => void
  onNavigateToParent: (node: PlotNode) => void
  onBackspaceDelete: (node: PlotNode) => void
  onUpdateBody: (nodeId: string, body: string) => void
  onAddCustomFieldDef: (categoryId: string) => void
  onRenameCustomFieldDef: (categoryId: string, fieldId: string, name: string) => void
  onRemoveCustomFieldDef: (categoryId: string, fieldId: string) => void
  onSetCustomFieldValue: (plotlineId: string, fieldId: string, value: string) => void
  onAddKeyword: (plotlineId: string, keyword: string) => void
  onRemoveKeyword: (plotlineId: string, keyword: string) => void
  registerInput: (nodeId: string, el: HTMLInputElement | null) => void
  onReorder: (orderedIds: string[]) => void
}

// Assigned plotpoints are shown inside their moment instead of here.
function visibleChildren(nodes: PlotNode[], parentId: string | null): PlotNode[] {
  return getChildren(nodes, parentId).filter((n) => !(n.kind === 'plotpoint' && n.assignedMomentId))
}

function PlotTreeView({
  nodes,
  parentId,
  levels,
  collapsedIds,
  onToggleCollapse,
  onRename,
  onDelete,
  onAddChild,
  onNextSibling,
  onPreviousSibling,
  onEnter,
  onNavigateToParent,
  onBackspaceDelete,
  onUpdateBody,
  onAddCustomFieldDef,
  onRenameCustomFieldDef,
  onRemoveCustomFieldDef,
  onSetCustomFieldValue,
  onAddKeyword,
  onRemoveKeyword,
  registerInput,
  onReorder,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const children = visibleChildren(nodes, parentId)

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
          const childHasChildren = visibleChildren(nodes, child.id).length > 0
          const isCollapsed = collapsedIds.has(child.id)
          const counts = child.kind === 'plotline' ? plotpointCounts(nodes, child.id) : { total: 0, assigned: 0 }
          const customFieldDefs =
            child.kind === 'plotline' ? getCustomFieldDefsForPlotline(nodes, child.id) : []
          return (
            <div key={child.id} className="plot-node__branch">
              <PlotNodeRow
                node={child}
                levels={levels}
                hasChildren={childHasChildren}
                collapsed={isCollapsed}
                onToggleCollapse={onToggleCollapse}
                plotpointTotal={counts.total}
                plotpointAssigned={counts.assigned}
                customFieldDefs={customFieldDefs}
                onRename={onRename}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onNextSibling={onNextSibling}
                onPreviousSibling={onPreviousSibling}
                onEnter={onEnter}
                onNavigateToParent={onNavigateToParent}
                onBackspaceDelete={onBackspaceDelete}
                onUpdateBody={onUpdateBody}
                onAddCustomFieldDef={onAddCustomFieldDef}
                onRenameCustomFieldDef={onRenameCustomFieldDef}
                onRemoveCustomFieldDef={onRemoveCustomFieldDef}
                onSetCustomFieldValue={onSetCustomFieldValue}
                onAddKeyword={onAddKeyword}
                onRemoveKeyword={onRemoveKeyword}
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
                    onRename={onRename}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onNextSibling={onNextSibling}
                    onPreviousSibling={onPreviousSibling}
                    onEnter={onEnter}
                    onNavigateToParent={onNavigateToParent}
                    onBackspaceDelete={onBackspaceDelete}
                    onUpdateBody={onUpdateBody}
                    onAddCustomFieldDef={onAddCustomFieldDef}
                    onRenameCustomFieldDef={onRenameCustomFieldDef}
                    onRemoveCustomFieldDef={onRemoveCustomFieldDef}
                    onSetCustomFieldValue={onSetCustomFieldValue}
                    onAddKeyword={onAddKeyword}
                    onRemoveKeyword={onRemoveKeyword}
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
