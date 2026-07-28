import { PLOT_KIND_ORDER } from '../../types'
import type { PlotNode, PlotNodeKind } from '../../types'
import * as tree from '../../lib/nodeTree'

export function getCategories(nodes: PlotNode[]): PlotNode[] {
  return tree.getRoots(nodes)
}

export function addCategory(nodes: PlotNode[], title: string): PlotNode[] {
  return addNode(nodes, null, 'category', title)
}

export function getChildren(nodes: PlotNode[], parentId: string | null): PlotNode[] {
  return tree.getChildren(nodes, parentId)
}

export function kindsDeeperThan(kind: PlotNodeKind): PlotNodeKind[] {
  const idx = PLOT_KIND_ORDER.indexOf(kind)
  return PLOT_KIND_ORDER.slice(idx + 1)
}

export function addNode(
  nodes: PlotNode[],
  parentId: string | null,
  kind: PlotNodeKind,
  title: string
): PlotNode[] {
  const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`
  const node: PlotNode = {
    id,
    kind,
    parentId,
    order: tree.nextOrder(nodes, parentId),
    title,
    body: '',
    assignedMomentId: null,
  }
  return [...nodes, node]
}

export function renameNode(nodes: PlotNode[], nodeId: string, title: string): PlotNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, title } : n))
}

export function updatePlotpoint(
  nodes: PlotNode[],
  nodeId: string,
  patch: { body?: string; assignedMomentId?: string | null }
): PlotNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n))
}

export function removeNode(nodes: PlotNode[], nodeId: string): PlotNode[] {
  return tree.removeSubtree(nodes, nodeId)
}

export function reorderSiblings(nodes: PlotNode[], orderedIds: string[]): PlotNode[] {
  return tree.reorderSiblings(nodes, orderedIds)
}

function makeNode(kind: PlotNodeKind, parentId: string | null, order: number): PlotNode {
  const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`
  return { id, kind, parentId, order, title: '', body: '', assignedMomentId: null }
}

/**
 * Creates a new empty child under `parent`, its kind taken from the
 * project's configured `levels`. Returns null if parent's kind is already
 * the deepest configured level -- i.e. Tab is a no-op there.
 */
export function createChildNode(
  nodes: PlotNode[],
  levels: PlotNodeKind[],
  parent: PlotNode
): { nodes: PlotNode[]; newNode: PlotNode } | null {
  const kind = tree.nextKindInLevels(levels, parent.kind, PLOT_KIND_ORDER)
  if (!kind) return null
  const newNode = makeNode(kind, parent.id, tree.nextOrder(nodes, parent.id))
  return { nodes: [...nodes, newNode], newNode }
}

/** Creates a new empty sibling immediately after `afterNode`, same kind. */
export function createSiblingNode(
  nodes: PlotNode[],
  afterNode: PlotNode
): { nodes: PlotNode[]; newNode: PlotNode } {
  const newNode = makeNode(afterNode.kind, afterNode.parentId, 0)
  return { nodes: tree.insertSiblingAfter(nodes, afterNode.id, newNode), newNode }
}
