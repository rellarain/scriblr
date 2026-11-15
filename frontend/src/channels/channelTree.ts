import type { ResourceNode, ResourceNodeKind } from '../api/types'

// The channel list's tree, read: the app's one interface > console > component > feature list, with stable ids, that
// feedback, plans, chats and queues point at (backend storage/channels.py). Pure, so it is tested in Node.

export interface ChannelIndex {
  nodes: ResourceNode[]
  byId: Map<string, ResourceNode>
  children: Map<string | null, ResourceNode[]>
}

export const KIND_LABEL: Record<ResourceNodeKind, string> = {
  interface: 'Interface', console: 'Console', component: 'Component', feature: 'Feature',
}

export const CHILD_KIND: Record<ResourceNodeKind, ResourceNodeKind | null> = {
  interface: 'console', console: 'component', component: 'feature', feature: null,
}

export function indexChannels(nodes: ResourceNode[]): ChannelIndex {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const children = new Map<string | null, ResourceNode[]>()
  for (const n of nodes) {
    const parent = n.parentId !== null && byId.has(n.parentId) ? n.parentId : null
    if (n.parentId !== null && parent === null) continue // an orphan: its parent is gone
    const list = children.get(parent) ?? []
    list.push(n)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  return { nodes, byId, children }
}

export const childrenOf = (index: ChannelIndex, parentId: string | null): ResourceNode[] => index.children.get(parentId) ?? []

// The node and every node above it, from the interface down.
export function pathOf(index: ChannelIndex, id: string | null): ResourceNode[] {
  const out: ResourceNode[] = []
  const seen = new Set<string>()
  let node = id ? index.byId.get(id) : undefined
  while (node && !seen.has(node.id)) {
    seen.add(node.id)
    out.unshift(node)
    node = node.parentId ? index.byId.get(node.parentId) : undefined
  }
  return out
}

// "Writer > Draft > Draft", or the id itself while the list has no such node.
export function labelOf(index: ChannelIndex, id: string | null): string {
  if (!id) return ''
  const path = pathOf(index, id)
  return path.length > 0 ? path.map(n => n.name || KIND_LABEL[n.kind]).join(' > ') : id
}

// The node, or the nearest node above it that still exists (an id is a path of its ancestors' ids: "writer/draft/draft"),
// or null.
export function nearest(index: ChannelIndex, id: string | null): ResourceNode | null {
  let at = id
  while (at) {
    const node = index.byId.get(at)
    if (node) return node
    const cut = at.lastIndexOf('/')
    at = cut > 0 ? at.slice(0, cut) : null
  }
  return null
}

// The node's id and every id under it (any depth).
export function subtreeIds(index: ChannelIndex, id: string): string[] {
  const out: string[] = []
  const walk = (at: string) => {
    if (out.includes(at)) return
    out.push(at)
    for (const child of childrenOf(index, at)) walk(child.id)
  }
  if (index.byId.has(id)) walk(id)
  return out
}

// The ids of the siblings in their new order after moving `id` one place up (-1) or down (1), or null at an end.
export function nudged(index: ChannelIndex, id: string, dir: -1 | 1): string[] | null {
  const node = index.byId.get(id)
  if (!node) return null
  const ids = childrenOf(index, node.parentId).map(n => n.id)
  const at = ids.indexOf(id)
  const to = at + dir
  if (at < 0 || to < 0 || to >= ids.length) return null
  ids.splice(at, 1)
  ids.splice(to, 0, id)
  return ids
}

// The ids of the siblings in their new order after dropping `id` before `beforeId` (null: at the end).
export function movedBefore(index: ChannelIndex, id: string, beforeId: string | null): string[] | null {
  const node = index.byId.get(id)
  if (!node) return null
  const ids = childrenOf(index, node.parentId).map(n => n.id).filter(x => x !== id)
  const at = beforeId === null ? ids.length : ids.indexOf(beforeId)
  if (at < 0) return null
  ids.splice(at, 0, id)
  return ids
}
