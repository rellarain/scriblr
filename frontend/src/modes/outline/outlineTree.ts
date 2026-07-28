import type { OutlineNode } from '../../types'

export function getBook(nodes: OutlineNode[]): OutlineNode | undefined {
  return nodes.find((n) => n.kind === 'book')
}

export function getChapters(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.filter((n) => n.kind === 'chapter').sort((a, b) => a.order - b.order)
}

export function getScenes(nodes: OutlineNode[], chapterId: string): OutlineNode[] {
  return nodes
    .filter((n) => n.kind === 'scene' && n.parentId === chapterId)
    .sort((a, b) => a.order - b.order)
}

function nextOrder(nodes: OutlineNode[], parentId: string | null): number {
  const siblings = nodes.filter((n) => n.parentId === parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((n) => n.order)) + 1
}

export function addChapter(nodes: OutlineNode[], bookId: string, title: string): OutlineNode[] {
  const id = `ch_${crypto.randomUUID().slice(0, 8)}`
  const chapter: OutlineNode = {
    id,
    kind: 'chapter',
    parentId: bookId,
    order: nextOrder(nodes, bookId),
    title,
    synopsis: '',
    draftRef: null,
  }
  return [...nodes, chapter]
}

export function addScene(nodes: OutlineNode[], chapterId: string, title: string): OutlineNode[] {
  const id = `scene_${crypto.randomUUID().slice(0, 8)}`
  const scene: OutlineNode = {
    id,
    kind: 'scene',
    parentId: chapterId,
    order: nextOrder(nodes, chapterId),
    title,
    synopsis: '',
    draftRef: id,
  }
  return [...nodes, scene]
}

export function renameNode(nodes: OutlineNode[], nodeId: string, title: string): OutlineNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, title } : n))
}

export function removeNode(nodes: OutlineNode[], nodeId: string): OutlineNode[] {
  const toRemove = new Set([nodeId])
  // Cascade: dropping a chapter also drops its scenes.
  for (const n of nodes) {
    if (n.parentId === nodeId) toRemove.add(n.id)
  }
  return nodes.filter((n) => !toRemove.has(n.id))
}

/**
 * Reorders the siblings of `parentId` to match `orderedIds`, rewriting their
 * `order` field to a dense 0..n-1 sequence. Nodes outside that sibling group
 * are returned unchanged.
 */
export function reorderSiblings(
  nodes: OutlineNode[],
  parentId: string,
  orderedIds: string[]
): OutlineNode[] {
  const orderById = new Map(orderedIds.map((id, index) => [id, index]))
  return nodes.map((n) => (orderById.has(n.id) ? { ...n, order: orderById.get(n.id)! } : n))
}
