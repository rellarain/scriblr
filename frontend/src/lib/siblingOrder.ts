// Insert a new node into a flat list right after one of its siblings.
// `inGroup` picks the siblings (nodes that share the new node's parent); their
// `order` values are renumbered 0..n so the new node lands exactly after
// `afterId` (or last when that sibling is not found). Other nodes are untouched.
export function insertAfter<T extends { id: string; order: number }>(
  all: T[], node: T, afterId: string | undefined, inGroup: (n: T) => boolean,
): T[] {
  const group = all.filter(inGroup).sort((a, b) => a.order - b.order)
  const at = afterId ? group.findIndex(n => n.id === afterId) : -1
  const ordered = at >= 0 ? [...group.slice(0, at + 1), node, ...group.slice(at + 1)] : [...group, node]
  const orderOf = new Map(ordered.map((n, i) => [n.id, i]))
  return [
    ...all.map(n => (orderOf.has(n.id) ? { ...n, order: orderOf.get(n.id)! } : n)),
    { ...node, order: orderOf.get(node.id)! },
  ]
}
