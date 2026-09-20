import type { OutlineNode, OutlineNodeKind } from '../../../api/types'
import { hasTime, timeChanged } from './timeSystem'
import { OUTLINE_KIND_ORDER } from '../../../api/types'

// Pure helpers over the flat outline list (parentId + order), shared by the
// sidebar, the book/chapter consoles and the chapter outline editor.

export type ChildIndex = Map<string | null, OutlineNode[]>

export function buildChildIndex(nodes: OutlineNode[]): ChildIndex {
  const map: ChildIndex = new Map()
  for (const n of nodes) {
    const bucket = map.get(n.parentId)
    if (bucket) bucket.push(n)
    else map.set(n.parentId, [n])
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.order - b.order)
  return map
}

// Every descendant of `id`, depth-first in outline order (not including id).
export function descendantsOf(index: ChildIndex, id: string): OutlineNode[] {
  const out: OutlineNode[] = []
  const walk = (parentId: string) => {
    for (const child of index.get(parentId) ?? []) {
      out.push(child)
      walk(child.id)
    }
  }
  walk(id)
  return out
}

// All book nodes in outline order -- a project's root is either a series
// wrapping several books or a single book directly.
export function booksOf(nodes: OutlineNode[]): OutlineNode[] {
  const index = buildChildIndex(nodes)
  const out: OutlineNode[] = []
  const walk = (parentId: string | null) => {
    for (const child of index.get(parentId) ?? []) {
      if (child.kind === 'book') out.push(child)
      walk(child.id)
    }
  }
  walk(null)
  return out
}

// The project's books as the shelf shows them: a group per series (with the books in it, in
// order) and runs of loose books (no series) between them, in outline order.
export interface ShelfGroup { series: OutlineNode | null; books: OutlineNode[] }

export function shelfGroups(nodes: OutlineNode[]): ShelfGroup[] {
  const index = buildChildIndex(nodes)
  const groups: ShelfGroup[] = []
  for (const item of index.get(null) ?? []) {
    if (item.kind === 'series') {
      groups.push({ series: item, books: descendantsOf(index, item.id).filter(n => n.kind === 'book') })
    } else if (item.kind === 'book') {
      const last = groups[groups.length - 1]
      if (last && last.series === null) last.books.push(item)
      else groups.push({ series: null, books: [item] })
    }
  }
  return groups
}

// Delete a series but keep its books: they take the series' place, in order, among its siblings.
export function dissolveSeries(nodes: OutlineNode[], seriesId: string): OutlineNode[] {
  const series = nodes.find(n => n.id === seriesId)
  if (!series || series.kind !== 'series') return nodes
  const index = buildChildIndex(nodes)
  const parentId = series.parentId
  const merged = (index.get(parentId) ?? []).flatMap(s => (s.id === seriesId ? index.get(seriesId) ?? [] : [s]))
  const orderById = new Map(merged.map((n, i) => [n.id, i]))
  return nodes
    .filter(n => n.id !== seriesId)
    .map(n => {
      const moved = n.parentId === seriesId ? { ...n, parentId } : n
      return orderById.has(n.id) ? { ...moved, order: orderById.get(n.id)! } : moved
    })
}

export function chaptersOfBook(nodes: OutlineNode[], bookId: string): OutlineNode[] {
  return descendantsOf(buildChildIndex(nodes), bookId).filter(n => n.kind === 'chapter')
}

// The nearest ancestor of `id` (or the node itself) with the given kind.
export function nearestOfKind(nodes: OutlineNode[], id: string, kind: OutlineNodeKind): OutlineNode | undefined {
  const byId = new Map(nodes.map(n => [n.id, n]))
  let current = byId.get(id)
  while (current) {
    if (current.kind === kind) return current
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return undefined
}

export function scenesInOrder(nodes: OutlineNode[], chapterId: string): OutlineNode[] {
  return descendantsOf(buildChildIndex(nodes), chapterId).filter(n => n.kind === 'scene')
}

export interface SceneChanges { location: boolean; time: boolean; action: boolean }

// What an empty scene field takes from the scenes before it (display only,
// never stored): per field, the value of the nearest earlier scene that has
// one, so a run of empty scenes all inherit the same earlier value.
export interface InheritedScene {
  location?: string
  action?: string
  timeValue?: Record<string, number>
}

const hasText = (text: string | undefined): text is string => text !== undefined && text.trim() !== ''

// The values scene `at` inherits from scenes[0..at-1] (the chapter's scenes in order).
export function inheritedSceneValues(scenes: OutlineNode[], at: number): InheritedScene {
  const out: InheritedScene = {}
  for (let i = at - 1; i >= 0; i -= 1) {
    const s = scenes[i]
    if (out.location === undefined && hasText(s.location)) out.location = s.location
    if (out.action === undefined && hasText(s.action)) out.action = s.action
    if (out.timeValue === undefined && hasTime(s.timeValue)) out.timeValue = s.timeValue
    if (out.location !== undefined && out.action !== undefined && out.timeValue !== undefined) break
  }
  return out
}

// Which of a scene's fields changed: it has a value of its own that differs
// from what it inherits. An empty field only inherits (never a change), and
// with nothing earlier to compare against nothing is a change.
export function sceneChanges(scene: OutlineNode, inherited: InheritedScene): SceneChanges {
  const differs = (key: 'location' | 'action') =>
    hasText(scene[key]) && inherited[key] !== undefined && scene[key] !== inherited[key]
  const timeDiffers = hasTime(scene.timeValue) && inherited.timeValue !== undefined && timeChanged(scene.timeValue, inherited.timeValue)
  return { location: differs('location'), time: timeDiffers, action: differs('action') }
}

// A node's parent must be strictly shallower (not necessarily adjacent).
export function canNest(parentKind: OutlineNodeKind, childKind: OutlineNodeKind): boolean {
  return OUTLINE_KIND_ORDER.indexOf(parentKind) < OUTLINE_KIND_ORDER.indexOf(childKind)
}

// Drag-and-drop: place `nodeId` under `parentId`, immediately before the child
// `beforeId` (or last when it is null). Returns null when the move is not allowed
// (nesting rule, into its own subtree, or `beforeId` is not a child of `parentId`).
export function moveNodeTo(
  nodes: OutlineNode[], nodeId: string, parentId: string | null, beforeId: string | null,
): OutlineNode[] | null {
  const node = nodes.find(n => n.id === nodeId)
  if (!node || nodeId === parentId || nodeId === beforeId) return null
  if (parentId === null) {
    // The project's top level holds series and books only.
    if (node.kind !== 'series' && node.kind !== 'book') return null
  } else {
    const parent = nodes.find(n => n.id === parentId)
    if (!parent || !canNest(parent.kind, node.kind)) return null
  }

  const index = buildChildIndex(nodes)
  if (parentId !== null && descendantsOf(index, nodeId).some(d => d.id === parentId)) return null

  const siblings = (index.get(parentId) ?? []).filter(n => n.id !== nodeId)
  let at = siblings.length
  if (beforeId !== null) {
    at = siblings.findIndex(n => n.id === beforeId)
    if (at < 0) return null
  }
  siblings.splice(at, 0, node)
  const orderById = new Map(siblings.map((n, i) => [n.id, i]))

  return nodes.map(n => {
    if (n.id === nodeId) return { ...n, parentId, order: orderById.get(n.id)! }
    if (n.parentId === parentId && orderById.has(n.id)) return { ...n, order: orderById.get(n.id)! }
    return n
  })
}

// Same, relative to a target: 'inside' appends to the target's children; 'before'
// inserts as a sibling immediately before the target.
export function moveNode(
  nodes: OutlineNode[], nodeId: string, targetId: string, mode: 'inside' | 'before',
): OutlineNode[] | null {
  const target = nodes.find(n => n.id === targetId)
  if (!target) return null
  if (mode === 'inside') return moveNodeTo(nodes, nodeId, target.id, null)
  return target.parentId ? moveNodeTo(nodes, nodeId, target.parentId, target.id) : null
}

// Word counts for a chapter's whole subtree, keyed by node id: a moment is
// its own draft's count, and every act/scene above it (and the chapter
// itself) is the sum of the moments inside it.
export function rollUpWordCounts(
  index: ChildIndex, chapterId: string, momentCounts: Record<string, number>,
): Map<string, number> {
  const totals = new Map<string, number>()
  const walk = (id: string, kind: OutlineNodeKind): number => {
    const kids = index.get(id) ?? []
    const own = kind === 'moment' ? momentCounts[id] ?? 0 : 0
    const total = own + kids.reduce((sum, kid) => sum + walk(kid.id, kid.kind), 0)
    totals.set(id, total)
    return total
  }
  walk(chapterId, 'chapter')
  return totals
}
