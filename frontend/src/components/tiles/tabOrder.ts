// The order of a console's tab-bar icons: the ids in the saved order, anything new after them in its own order.
export function orderTabs(ids: string[], saved: readonly string[] | undefined): string[] {
  const known = (saved ?? []).filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i)
  return [...known, ...ids.filter(id => !known.includes(id))]
}

// The order with one id moved to sit before another (null: the end).
export function moveTab(order: string[], id: string, beforeId: string | null): string[] {
  const without = order.filter(x => x !== id)
  if (beforeId === null || beforeId === id) return beforeId === id ? order : [...without, id]
  const at = without.indexOf(beforeId)
  return at < 0 ? order : [...without.slice(0, at), id, ...without.slice(at)]
}

// Where a pointer over a bar's icons would drop: before or after the icon under it (null where it is over none).
export function tabDropAt(boxes: Array<{ id: string; left: number; top: number; right: number; bottom: number }>, x: number, y: number): { beforeId: string | null; markId: string; side: 'before' | 'after' } | null {
  const i = boxes.findIndex(b => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)
  if (i < 0) return null
  const b = boxes[i]
  const before = x < (b.left + b.right) / 2
  return { beforeId: before ? b.id : boxes[i + 1]?.id ?? null, markId: b.id, side: before ? 'before' : 'after' }
}
