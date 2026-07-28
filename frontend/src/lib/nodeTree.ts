// Generic helpers for the flat-list-with-parentId tree shape shared by the
// outline tree (book/arc/chapter/scene/moment) and the plot tree
// (category/plotline/plotpoint). Both are "whole shard rewrite" trees: the
// frontend mutates a local copy and PUTs the entire tree back.

export interface TreeNodeBase {
  id: string
  parentId: string | null
  order: number
}

export function getChildren<T extends TreeNodeBase>(nodes: T[], parentId: string | null): T[] {
  return nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order)
}

export function getRoots<T extends TreeNodeBase>(nodes: T[]): T[] {
  return getChildren(nodes, null)
}

export function nextOrder<T extends TreeNodeBase>(nodes: T[], parentId: string | null): number {
  const siblings = getChildren(nodes, parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((n) => n.order)) + 1
}

/**
 * Rewrites the `order` field of `parentId`'s children to match
 * `orderedIds`. Nodes outside that sibling group are returned unchanged.
 */
export function reorderSiblings<T extends TreeNodeBase>(
  nodes: T[],
  orderedIds: string[]
): T[] {
  const orderById = new Map(orderedIds.map((id, index) => [id, index]))
  return nodes.map((n) => (orderById.has(n.id) ? { ...n, order: orderById.get(n.id)! } : n))
}

/** Removes a node and all of its descendants, at any depth. */
export function removeSubtree<T extends TreeNodeBase>(nodes: T[], nodeId: string): T[] {
  const toRemove = new Set([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const n of nodes) {
      if (n.parentId !== null && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
        toRemove.add(n.id)
        changed = true
      }
    }
  }
  return nodes.filter((n) => !toRemove.has(n.id))
}

export function depthOf<T extends TreeNodeBase>(nodes: T[], nodeId: string): number {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let depth = 0
  let current = byId.get(nodeId)
  while (current?.parentId) {
    depth++
    current = byId.get(current.parentId)
  }
  return depth
}

/** Full tree in depth-first document order (respecting each level's `order`). */
export function depthFirstOrder<T extends TreeNodeBase>(nodes: T[], rootId: string | null = null): T[] {
  const result: T[] = []
  function visit(parentId: string | null) {
    for (const child of getChildren(nodes, parentId)) {
      result.push(child)
      visit(child.id)
    }
  }
  visit(rootId)
  return result
}

/**
 * Inserts `newNode` as the next sibling immediately after `afterNodeId`,
 * renumbering that sibling group's `order` to match. Used for Enter-creates-
 * sibling in the keyboard-driven Plan editors.
 */
export function insertSiblingAfter<T extends TreeNodeBase>(
  nodes: T[],
  afterNodeId: string,
  newNode: T
): T[] {
  const after = nodes.find((n) => n.id === afterNodeId)
  const parentId = after ? after.parentId : null
  const siblings = getChildren(nodes, parentId)
  const idx = siblings.findIndex((s) => s.id === afterNodeId)
  const orderedIds = siblings.map((s) => s.id)
  orderedIds.splice(idx + 1, 0, newNode.id)
  return reorderSiblings([...nodes, newNode], orderedIds)
}

/**
 * The next kind after `kind` in `levels` (the project's configured level
 * sequence), or undefined if `kind` is already the deepest configured level.
 * Falls back to `fallbackOrder` (the full canonical kind order) if `kind`
 * isn't present in `levels` at all -- e.g. a node created before the
 * project's level settings were narrowed to exclude its kind.
 */
export function nextKindInLevels<K extends string>(
  levels: K[],
  kind: K,
  fallbackOrder: K[]
): K | undefined {
  const idx = levels.indexOf(kind)
  if (idx !== -1) return levels[idx + 1]
  const fallbackIdx = fallbackOrder.indexOf(kind)
  return fallbackIdx === -1 ? undefined : fallbackOrder[fallbackIdx + 1]
}
