import { PLOT_KIND_ORDER } from '../../types'
import type { PlotNode, PlotNodeKind } from '../../types'
import * as tree from '../../lib/nodeTree'

export function getCategories(nodes: PlotNode[]): PlotNode[] {
  return tree.getRoots(nodes)
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
