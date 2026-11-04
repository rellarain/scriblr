import type { PlotNode, PlotNodeKind } from '../../../api/types'
import { nodeLabel, plotTrail } from './plotTree'

// Links between plot nodes. A category, subcategory, cluster or plotline can be linked to any other of those (never to a plotpoint), for a jump from
// either end. A link is stored on both nodes (`links`, the ids of the others), and every change goes through syncLinks so the two ends agree.

export const PLOT_MAX_LINKS = 100 // as the server's PLOT_MAX_LINKS

export type LinkKind = Extract<PlotNodeKind, 'category' | 'subcategory' | 'cluster' | 'plotline'>
export const LINK_KINDS: LinkKind[] = ['category', 'subcategory', 'cluster', 'plotline']
const linkable = (node: PlotNode) => node.kind !== 'plotpoint'

export const linksOf = (node: PlotNode): string[] => node.links ?? []

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

// Make the links true to both ends: a link to oneself, to something that is gone, or from or to a plotpoint is dropped; a repeat is dropped; and a link
// held by one end only is added to the other (after the links it already has). Idempotent; returns the same array when nothing changes.
export function syncLinks(nodes: PlotNode[]): PlotNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const valid = (from: PlotNode, id: string) => id !== from.id && byId.get(id) !== undefined && linkable(byId.get(id)!) && linkable(from)
  const wanted = new Map<string, string[]>()
  for (const node of nodes) wanted.set(node.id, [...new Set(linksOf(node).filter(id => valid(node, id)))])
  for (const node of nodes) {
    for (const id of wanted.get(node.id)!) {
      const other = wanted.get(id)!
      if (!other.includes(node.id)) other.push(node.id)
    }
  }
  let changed = false
  const next = nodes.map(node => {
    const links = wanted.get(node.id)!
    if (same(links, linksOf(node))) return node
    changed = true
    return { ...node, links }
  })
  return changed ? next : nodes
}

// Link two nodes (both ends), when both can take it.
export function linkNodes(nodes: PlotNode[], a: string, b: string): PlotNode[] {
  const from = nodes.find(n => n.id === a)
  const to = nodes.find(n => n.id === b)
  if (!from || !to || a === b || !linkable(from) || !linkable(to) || linksOf(from).includes(b)) return nodes
  if (linksOf(from).length >= PLOT_MAX_LINKS || linksOf(to).length >= PLOT_MAX_LINKS) return nodes
  return syncLinks(nodes.map(n => (n.id === a ? { ...n, links: [...linksOf(n), b] } : n)))
}

// Take a link away from both ends.
export function unlinkNodes(nodes: PlotNode[], a: string, b: string): PlotNode[] {
  if (!nodes.some(n => (n.id === a && linksOf(n).includes(b)) || (n.id === b && linksOf(n).includes(a)))) return nodes
  return nodes.map(n => {
    if (n.id === a && linksOf(n).includes(b)) return { ...n, links: linksOf(n).filter(id => id !== b) }
    if (n.id === b && linksOf(n).includes(a)) return { ...n, links: linksOf(n).filter(id => id !== a) }
    return n
  })
}

// The place of a node in the plot, as the picker names it: "Category › Subcategory › Title".
export function pathLabel(node: PlotNode, byId: Map<string, PlotNode>): string {
  return [...plotTrail(node, byId), node].map(nodeLabel).join(' › ')
}

export interface LinkChoice { id: string; label: string }
export interface LinkChoices { kind: LinkKind; heading: string; items: LinkChoice[] }

const HEADING: Record<LinkKind, string> = { category: 'Categories', subcategory: 'Subcategories', cluster: 'Clusters', plotline: 'Plotlines' }

// What a node can still be linked to, by kind: not itself, nor what it sits under or holds (those are one click away already, in the parent chips and
// the child rows), nor what it is linked to, nor a node whose own links are full. Kinds with nothing to offer are left out.
export function linkChoices(node: PlotNode, nodes: PlotNode[]): LinkChoices[] {
  if (!linkable(node) || linksOf(node).length >= PLOT_MAX_LINKS) return []
  const byId = new Map(nodes.map(n => [n.id, n]))
  const taken = new Set(linksOf(node))
  const above = new Set(plotTrail(node, byId).map(n => n.id))
  const offered = nodes.filter(n =>
    linkable(n) && n.id !== node.id && !taken.has(n.id) && !above.has(n.id) && linksOf(n).length < PLOT_MAX_LINKS
    && !plotTrail(n, byId).some(a => a.id === node.id))
  return LINK_KINDS.flatMap(kind => {
    const items = offered.filter(n => n.kind === kind).map(n => ({ id: n.id, label: pathLabel(n, byId) }))
      .sort((x, y) => x.label.localeCompare(y.label, undefined, { sensitivity: 'base', numeric: true }))
    return items.length > 0 ? [{ kind, heading: HEADING[kind], items }] : []
  })
}
