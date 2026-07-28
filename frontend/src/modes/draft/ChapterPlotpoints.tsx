import { useMemo, useState } from 'react'
import type { OutlineNode, PlotNode } from '../../types'
import { momentsInSubtree } from '../outline/outlineTree'
import { plotpointsForMomentSet } from '../plan/plotTree'

interface Props {
  nodes: OutlineNode[]
  plotNodes: PlotNode[]
  chapterId: string
}

// Read-only, collapsible category -> plotline -> plotpoint view scoped to
// every plotpoint assigned to any moment within this chapter -- reference
// material while drafting, mirrors PlotTreeView's grouping but with no
// editing/drag affordances.
function ChapterPlotpoints({ nodes, plotNodes, chapterId }: Props) {
  // Presence in this set means "expanded" -- an empty set at load means
  // every category/plotline starts collapsed/minimized.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const momentIds = useMemo(
    () => new Set(momentsInSubtree(nodes, chapterId).map((m) => m.id)),
    [nodes, chapterId]
  )
  const plotpoints = plotpointsForMomentSet(plotNodes, momentIds)

  const byPlotline = new Map<string, PlotNode[]>()
  for (const pp of plotpoints) {
    if (!pp.parentId) continue
    const list = byPlotline.get(pp.parentId) ?? []
    list.push(pp)
    byPlotline.set(pp.parentId, list)
  }

  const plotlinesWithPoints = plotNodes.filter(
    (n) => n.kind === 'plotline' && byPlotline.has(n.id)
  )
  const categoryIds = new Set(plotlinesWithPoints.map((pl) => pl.parentId).filter(Boolean) as string[])
  const categoriesWithPlotlines = plotNodes.filter((n) => n.kind === 'category' && categoryIds.has(n.id))

  return (
    <aside className="chapter-plotpoints">
      <h4>Plotpoints in this chapter</h4>
      {categoriesWithPlotlines.map((category) => {
        const catCollapsed = !expandedIds.has(category.id)
        const catPlotlines = plotlinesWithPoints.filter((pl) => pl.parentId === category.id)
        return (
          <div key={category.id} className="chapter-plotpoints__category">
            <button
              type="button"
              className="chapter-plotpoints__toggle chapter-plotpoints__toggle--category"
              onClick={() => toggle(category.id)}
            >
              {catCollapsed ? '▸' : '▾'} {category.title || 'Untitled'}
            </button>
            {!catCollapsed &&
              catPlotlines.map((plotline) => {
                const plCollapsed = !expandedIds.has(plotline.id)
                const points = byPlotline.get(plotline.id) ?? []
                return (
                  <div key={plotline.id} className="chapter-plotpoints__plotline">
                    <button
                      type="button"
                      className="chapter-plotpoints__toggle chapter-plotpoints__toggle--plotline"
                      onClick={() => toggle(plotline.id)}
                    >
                      {plCollapsed ? '▸' : '▾'} {plotline.title || 'Untitled'}
                    </button>
                    {!plCollapsed && (
                      <ul className="chapter-plotpoints__points">
                        {points.map((pp) => (
                          <li key={pp.id}>
                            <span className="chapter-plotpoints__point-title">{pp.title || 'Untitled'}</span>
                            {pp.body && <span className="chapter-plotpoints__point-body"> — {pp.body}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}
      {categoriesWithPlotlines.length === 0 && (
        <p className="chapter-plotpoints__empty">No plotpoints assigned in this chapter.</p>
      )}
    </aside>
  )
}

export default ChapterPlotpoints
