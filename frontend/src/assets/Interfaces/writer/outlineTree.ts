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

// Which of a scene's fields differ from the previous scene. The first scene
// has nothing to compare against and an empty value is never highlighted.
export function sceneChanges(scene: OutlineNode, previous: OutlineNode | undefined): SceneChanges {
  const differs = (key: 'location' | 'action') =>
    Boolean(previous) && Boolean(scene[key]) && scene[key] !== previous![key]
  const timeDiffers = Boolean(previous) && hasTime(scene.timeValue) && timeChanged(scene.timeValue, previous!.timeValue)
  return { location: differs('location'), time: timeDiffers, action: differs('action') }
}

// A node's parent must be strictly shallower (not necessarily adjacent).
export function canNest(parentKind: OutlineNodeKind, childKind: OutlineNodeKind): boolean {
  return OUTLINE_KIND_ORDER.indexOf(parentKind) < OUTLINE_KIND_ORDER.indexOf(childKind)
}

// Drag-and-drop reparenting. 'inside' appends to the target's children;
// 'before' inserts as a sibling immediately before the target. Returns null
// when the move is not allowed (nesting rule, or into its own subtree).
export function moveNode(
  nodes: OutlineNode[], nodeId: string, targetId: string, mode: 'inside' | 'before',
): OutlineNode[] | null {
  if (nodeId === targetId) return null
  const node = nodes.find(n => n.id === nodeId)
  const target = nodes.find(n => n.id === targetId)
  if (!node || !target) return null

  const index = buildChildIndex(nodes)
  if (descendantsOf(index, nodeId).some(d => d.id === targetId)) return null

  const newParentId = mode === 'inside' ? target.id : target.parentId
  const newParent = newParentId ? nodes.find(n => n.id === newParentId) : undefined
  if (!newParent || !canNest(newParent.kind, node.kind)) return null

  const siblings = (index.get(newParentId) ?? []).filter(n => n.id !== nodeId)
  const at = mode === 'inside' ? siblings.length : siblings.findIndex(n => n.id === targetId)
  siblings.splice(at, 0, node)
  const orderById = new Map(siblings.map((n, i) => [n.id, i]))

  return nodes.map(n => {
    if (n.id === nodeId) return { ...n, parentId: newParentId, order: orderById.get(n.id)! }
    if (n.parentId === newParentId && orderById.has(n.id)) return { ...n, order: orderById.get(n.id)! }
    return n
  })
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
