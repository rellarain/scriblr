import type { PlotNode } from '../../../api/types'
import { hueOfCode, rangeOf } from '../../../theme/bookColors'
import { fitToParent } from './levelHues'
import { categoryOf } from './plotTree'

// Plot colours: a category is within HUE_RANGES.category (90) of the project's hue, a subcategory within 60 of its category's, and a cluster
// within 30 of its subcategory's (its category's when it sits straight under one). Each node's own `hue` is optional: with none it shows
// its parent's (a category with none shows the app theme's hue).

// The node a plot node's colour is measured from; none for a category (it is measured from the project).
export function plotParentOf(node: PlotNode, byId: Map<string, PlotNode>): PlotNode | undefined {
  if (node.kind === 'category') return undefined
  if (node.kind === 'cluster') {
    for (let current = node.parentId ? byId.get(node.parentId) : undefined, guard = 0; current && guard < 8; guard += 1) {
      if (current.kind === 'subcategory' || current.kind === 'category') return current
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return undefined
  }
  return categoryOf(node, byId)
}

// The hue a node shows: its own, else its parent's, else (for a category) `appHue`, the app theme's.
export function shownPlotHue(node: PlotNode | undefined, byId: Map<string, PlotNode>, appHue: number): number {
  if (!node) return appHue
  return node.hue ?? shownPlotHue(plotParentOf(node, byId), byId, appHue)
}

// The hue a node has by what is stored (its own, else its parent's), or null when no node up the chain has one.
function storedHue(node: PlotNode, byId: Map<string, PlotNode>): number | null {
  if (node.hue != null) return node.hue
  const parent = plotParentOf(node, byId)
  return parent ? storedHue(parent, byId) : null
}

// Every subcategory and cluster under `fromId` that has a hue of its own, held inside its range of its parent's hue, top down (a pulled-back
// subcategory then pulls its clusters). The node itself is not moved; nothing outside what is under it is touched.
export function reconcilePlotHues(nodes: PlotNode[], fromId: string): PlotNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const children = new Map<string | null, PlotNode[]>()
  for (const n of nodes) {
    const bucket = children.get(n.parentId)
    if (bucket) bucket.push(n)
    else children.set(n.parentId, [n])
  }
  const queue = [fromId]
  for (let i = 0; i < queue.length; i += 1) {
    for (const child of children.get(queue[i]) ?? []) {
      queue.push(child.id)
      if ((child.kind !== 'subcategory' && child.kind !== 'cluster') || child.hue == null) continue
      const parent = plotParentOf(child, byId)
      const centre = parent ? storedHue(parent, byId) : null
      if (centre === null) continue
      const fitted = fitToParent(child.hue, hueOfCode(centre), rangeOf(child.kind))
      if (fitted !== child.hue) byId.set(child.id, { ...child, hue: fitted })
    }
  }
  return nodes.map(n => byId.get(n.id) ?? n)
}
