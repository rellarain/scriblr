import type { OutlineNode, PlotNode } from '../../../../api/types'
import type { ChildIndex } from '../outlineTree'

// Every moment in the chapter that has any draft text.
export function chapterHasDraft(bodies: Record<string, string>): boolean {
  return Object.values(bodies).some(body => body.trim() !== '')
}

// The titles stacked above a chapter on the left page: its series, book and arc, outermost first.
export function parentTrail(chapterId: string, nodeById: Map<string, OutlineNode>): OutlineNode[] {
  const trail: OutlineNode[] = []
  let current = nodeById.get(chapterId)
  for (let guard = 0; current && guard < 16; guard += 1) {
    current = current.parentId ? nodeById.get(current.parentId) : undefined
    if (current && (current.kind === 'series' || current.kind === 'book' || current.kind === 'arc')) trail.unshift(current)
  }
  return trail
}

// The plotpoints of a chapter as the left page lists them: those assigned to the chapter itself
// first, then those placed on its acts, scenes and moments, in outline order.
export function chapterPlotpoints(
  chapterId: string, index: ChildIndex, pointsByNode: Map<string, PlotNode[]>,
): PlotNode[] {
  const out: PlotNode[] = [...(pointsByNode.get(chapterId) ?? [])]
  const walk = (id: string) => {
    for (const kid of index.get(id) ?? []) {
      out.push(...(pointsByNode.get(kid.id) ?? []))
      walk(kid.id)
    }
  }
  walk(chapterId)
  return out
}
