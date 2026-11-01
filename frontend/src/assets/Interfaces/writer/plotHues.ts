import type { PlotNode } from '../../../api/types'
import { effectiveRange, hueOfCode } from '../../../theme/bookColors'
import { fitToParent } from './levelHues'
import { categoryOf } from './plotTree'

// Plot colours: a category is within its range (90 until another is chosen) of the project's hue, a subcategory within its range (60) of its
// category's, and a cluster within its range (30) of its subcategory's (its category's when it sits straight under one). A range is the node's own
// `hueRange` (30, 60, 90, 120, 180 or 360), else its kind's default, never wider than its parent's (plotRange). Each node's own `hue` is optional: with
// none it shows its parent's (a category with none shows the project's hue: it inherits).

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

// How far a node's colour may sit from its parent's hue, in degrees either side: its own range, else its kind's default, never wider than its
// parent's (a category's parent is the project, whose range is `projectRange`).
export function plotRange(node: PlotNode, byId: Map<string, PlotNode>, projectRange: number): number {
  return effectiveRange(node.hueRange, node.kind, plotRangeCap(node, byId, projectRange))
}

// The widest a node's range may be: its parent's range.
export function plotRangeCap(node: PlotNode, byId: Map<string, PlotNode>, projectRange: number): number {
  const parent = plotParentOf(node, byId)
  return parent ? plotRange(parent, byId, projectRange) : projectRange
}

// The hue a node shows: its own, else its parent's, else (for a category) `projectHue`.
export function shownPlotHue(node: PlotNode | undefined, byId: Map<string, PlotNode>, projectHue: number): number {
  if (!node) return projectHue
  return node.hue ?? shownPlotHue(plotParentOf(node, byId), byId, projectHue)
}

// The hue a node has by what is stored (its own, else its parent's), or null when no node up the chain has one.
function storedHue(node: PlotNode, byId: Map<string, PlotNode>): number | null {
  if (node.hue != null) return node.hue
  const parent = plotParentOf(node, byId)
  return parent ? storedHue(parent, byId) : null
}

// Every category, subcategory and cluster under `fromId` (null: under the project, so all of them) that has a hue of its own, held inside its range of its parent's hue, top
// down (a pulled-back subcategory then pulls its clusters), and a range of its own wider than its parent's is lowered to it. The node itself is not
// moved; nothing outside what is under it is touched. A category's parent hue is `projectHue` (needed only where categories are reconciled).
export function reconcilePlotHues(nodes: PlotNode[], fromId: string | null, projectRange = 360, projectHue?: number): PlotNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const children = new Map<string | null, PlotNode[]>()
  for (const n of nodes) {
    const bucket = children.get(n.parentId)
    if (bucket) bucket.push(n)
    else children.set(n.parentId, [n])
  }
  // Top down (parents first), so a pulled-back node then pulls what is under it.
  const queue = (children.get(fromId) ?? []).map(n => n.id)
  for (let i = 0; i < queue.length; i += 1) {
    hold(queue[i])
    for (const child of children.get(queue[i]) ?? []) queue.push(child.id)
  }
  function hold(id: string) {
    const node = byId.get(id)
    if (!node || (node.kind !== 'category' && node.kind !== 'subcategory' && node.kind !== 'cluster')) return
    const cap = plotRangeCap(node, byId, projectRange)
    let next = node
    if (node.hueRange != null && node.hueRange > cap) next = { ...next, hueRange: cap }
    if (node.hue != null) {
      const parent = plotParentOf(node, byId)
      // With the project's hue known a node with no colour up the chain measures from it (a category with none inherits it); else only a stored hue counts.
      const centre = projectHue !== undefined ? (parent ? shownPlotHue(parent, byId, projectHue) : node.kind === 'category' ? projectHue : null) : parent ? storedHue(parent, byId) : null
      if (centre !== null) {
        const fitted = fitToParent(node.hue, hueOfCode(centre), effectiveRange(next.hueRange, node.kind, cap))
        if (fitted !== node.hue) next = { ...next, hue: fitted }
      }
    }
    if (next !== node) byId.set(id, next)
  }
  return nodes.map(n => byId.get(n.id) ?? n)
}
