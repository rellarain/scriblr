import { PLOT_KIND_ORDER } from '../../types'
import type { PlotCustomFieldDef, PlotNode, PlotNodeKind } from '../../types'
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
    customFieldDefs: [],
    customFieldValues: {},
    keywords: [],
  }
  return [...nodes, node]
}

export function renameNode(nodes: PlotNode[], nodeId: string, title: string): PlotNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, title } : n))
}

export function updatePlotpointBody(nodes: PlotNode[], nodeId: string, body: string): PlotNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, body } : n))
}

export function assignPlotpoint(
  nodes: PlotNode[],
  plotpointId: string,
  momentId: string | null
): PlotNode[] {
  return nodes.map((n) => (n.id === plotpointId ? { ...n, assignedMomentId: momentId } : n))
}

/** Direct plotpoint children of `plotlineId`, and how many are assigned to a moment. */
export function plotpointCounts(nodes: PlotNode[], plotlineId: string): { total: number; assigned: number } {
  const children = tree.getChildren(nodes, plotlineId).filter((n) => n.kind === 'plotpoint')
  return { total: children.length, assigned: children.filter((n) => n.assignedMomentId !== null).length }
}

export function plotpointsForMoment(nodes: PlotNode[], momentId: string): PlotNode[] {
  return nodes.filter((n) => n.kind === 'plotpoint' && n.assignedMomentId === momentId)
}

/** A plotline's parent is always its category (the only shallower plot kind). */
export function getCustomFieldDefsForPlotline(nodes: PlotNode[], plotlineId: string): PlotCustomFieldDef[] {
  const plotline = nodes.find((n) => n.id === plotlineId)
  if (!plotline || !plotline.parentId) return []
  const category = nodes.find((n) => n.id === plotline.parentId)
  return category?.customFieldDefs ?? []
}

export function addCustomFieldDef(nodes: PlotNode[], categoryId: string, name: string): PlotNode[] {
  const id = `field_${crypto.randomUUID().slice(0, 8)}`
  return nodes.map((n) =>
    n.id === categoryId ? { ...n, customFieldDefs: [...n.customFieldDefs, { id, name }] } : n
  )
}

export function renameCustomFieldDef(
  nodes: PlotNode[],
  categoryId: string,
  fieldId: string,
  name: string
): PlotNode[] {
  return nodes.map((n) =>
    n.id === categoryId
      ? { ...n, customFieldDefs: n.customFieldDefs.map((f) => (f.id === fieldId ? { ...f, name } : f)) }
      : n
  )
}

/** Removing a field definition also clears any values plotlines in this category stored for it. */
export function removeCustomFieldDef(nodes: PlotNode[], categoryId: string, fieldId: string): PlotNode[] {
  return nodes.map((n) => {
    if (n.id === categoryId) {
      return { ...n, customFieldDefs: n.customFieldDefs.filter((f) => f.id !== fieldId) }
    }
    if (n.kind === 'plotline' && n.parentId === categoryId && fieldId in n.customFieldValues) {
      const nextValues = { ...n.customFieldValues }
      delete nextValues[fieldId]
      return { ...n, customFieldValues: nextValues }
    }
    return n
  })
}

export function setCustomFieldValue(
  nodes: PlotNode[],
  plotlineId: string,
  fieldId: string,
  value: string
): PlotNode[] {
  return nodes.map((n) =>
    n.id === plotlineId ? { ...n, customFieldValues: { ...n.customFieldValues, [fieldId]: value } } : n
  )
}

export function addKeyword(nodes: PlotNode[], plotlineId: string, keyword: string): PlotNode[] {
  const trimmed = keyword.trim()
  if (!trimmed) return nodes
  return nodes.map((n) =>
    n.id === plotlineId && !n.keywords.includes(trimmed) ? { ...n, keywords: [...n.keywords, trimmed] } : n
  )
}

export function removeKeyword(nodes: PlotNode[], plotlineId: string, keyword: string): PlotNode[] {
  return nodes.map((n) => (n.id === plotlineId ? { ...n, keywords: n.keywords.filter((k) => k !== keyword) } : n))
}

export function removeNode(nodes: PlotNode[], nodeId: string): PlotNode[] {
  return tree.removeSubtree(nodes, nodeId)
}

export function reorderSiblings(nodes: PlotNode[], orderedIds: string[]): PlotNode[] {
  return tree.reorderSiblings(nodes, orderedIds)
}

function makeNode(kind: PlotNodeKind, parentId: string | null, order: number): PlotNode {
  const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`
  return {
    id,
    kind,
    parentId,
    order,
    title: '',
    body: '',
    assignedMomentId: null,
    customFieldDefs: [],
    customFieldValues: {},
    keywords: [],
  }
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

export function hasChildren(nodes: PlotNode[], nodeId: string): boolean {
  return tree.getChildren(nodes, nodeId).length > 0
}

export function getNextSibling(nodes: PlotNode[], nodeId: string): PlotNode | undefined {
  return tree.nextSibling(nodes, nodeId)
}

export function getPreviousSibling(nodes: PlotNode[], nodeId: string): PlotNode | undefined {
  return tree.previousSibling(nodes, nodeId)
}

/**
 * Re-parents `pendingId` (a still-empty node just created as a sibling of
 * `anchorId` via Enter) to become a child of `anchorId` instead -- the
 * "press Enter twice" escalation. Returns null if `anchorId`'s kind is
 * already the deepest configured level.
 */
export function escalateToChild(
  nodes: PlotNode[],
  levels: PlotNodeKind[],
  anchorId: string,
  pendingId: string
): PlotNode[] | null {
  const anchor = nodes.find((n) => n.id === anchorId)
  const pendingNode = nodes.find((n) => n.id === pendingId)
  if (!anchor || !pendingNode) return null
  const kind = tree.nextKindInLevels(levels, anchor.kind, PLOT_KIND_ORDER)
  if (!kind) return null

  const withoutPending = nodes.filter((n) => n.id !== pendingId)
  const oldSiblingIds = tree.getChildren(withoutPending, pendingNode.parentId).map((s) => s.id)
  const renumbered = tree.reorderSiblings(withoutPending, oldSiblingIds)
  const updated: PlotNode = {
    ...pendingNode,
    parentId: anchor.id,
    kind,
    order: tree.nextOrder(renumbered, anchor.id),
  }
  return [...renumbered, updated]
}
