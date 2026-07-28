import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineNodeKind } from '../../types'
import * as tree from '../../lib/nodeTree'

/** A project may contain multiple books (e.g. a series) — all root-level nodes. */
export function getBooks(nodes: OutlineNode[]): OutlineNode[] {
  return tree.getRoots(nodes)
}

export function addBook(nodes: OutlineNode[], title: string): OutlineNode[] {
  return addNode(nodes, null, 'book', title)
}

export function getChildren(nodes: OutlineNode[], parentId: string | null): OutlineNode[] {
  return tree.getChildren(nodes, parentId)
}

export function getAllMoments(nodes: OutlineNode[]): OutlineNode[] {
  return tree.depthFirstOrder(nodes).filter((n) => n.kind === 'moment')
}

export function documentOrder(nodes: OutlineNode[]): OutlineNode[] {
  return tree.depthFirstOrder(nodes)
}

export function depthOf(nodes: OutlineNode[], nodeId: string): number {
  return tree.depthOf(nodes, nodeId)
}

/** Kinds that may legally nest under a node of the given kind (flexible: any strictly-deeper kind). */
export function kindsDeeperThan(kind: OutlineNodeKind): OutlineNodeKind[] {
  const idx = OUTLINE_KIND_ORDER.indexOf(kind)
  return OUTLINE_KIND_ORDER.slice(idx + 1)
}

export function addNode(
  nodes: OutlineNode[],
  parentId: string | null,
  kind: OutlineNodeKind,
  title: string
): OutlineNode[] {
  const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`
  const node: OutlineNode = {
    id,
    kind,
    parentId,
    order: tree.nextOrder(nodes, parentId),
    title,
    synopsis: '',
    draftRef: kind === 'moment' ? id : null,
  }
  return [...nodes, node]
}

export function renameNode(nodes: OutlineNode[], nodeId: string, title: string): OutlineNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, title } : n))
}

export function removeNode(nodes: OutlineNode[], nodeId: string): OutlineNode[] {
  return tree.removeSubtree(nodes, nodeId)
}

export function reorderSiblings(nodes: OutlineNode[], orderedIds: string[]): OutlineNode[] {
  return tree.reorderSiblings(nodes, orderedIds)
}

function makeNode(kind: OutlineNodeKind, parentId: string | null, order: number): OutlineNode {
  const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`
  return {
    id,
    kind,
    parentId,
    order,
    title: '',
    synopsis: '',
    draftRef: kind === 'moment' ? id : null,
  }
}

/**
 * Creates a new empty child under `parent`, its kind taken from the
 * project's configured `levels` (the next level deeper than parent's kind).
 * Returns null if parent's kind is already the deepest configured level --
 * i.e. Tab is a no-op there.
 */
export function createChildNode(
  nodes: OutlineNode[],
  levels: OutlineNodeKind[],
  parent: OutlineNode
): { nodes: OutlineNode[]; newNode: OutlineNode } | null {
  const kind = tree.nextKindInLevels(levels, parent.kind, OUTLINE_KIND_ORDER)
  if (!kind) return null
  const newNode = makeNode(kind, parent.id, tree.nextOrder(nodes, parent.id))
  return { nodes: [...nodes, newNode], newNode }
}

/** Creates a new empty sibling immediately after `afterNode`, same kind. */
export function createSiblingNode(
  nodes: OutlineNode[],
  afterNode: OutlineNode
): { nodes: OutlineNode[]; newNode: OutlineNode } {
  const newNode = makeNode(afterNode.kind, afterNode.parentId, 0)
  return { nodes: tree.insertSiblingAfter(nodes, afterNode.id, newNode), newNode }
}
