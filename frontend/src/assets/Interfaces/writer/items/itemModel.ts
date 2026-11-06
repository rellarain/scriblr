import type { ItemDoc, ItemHolding } from '../../../../api/types'
import type { StoryPoint } from '../characters/story'

// Pure helpers for the item library: the holdings of an item in book order, who has it at a point of the story, and what a character holds. A holding starts at a chapter or
// scene of the outline (empty: from the start of the story) and lasts until the next one, the way a character's states do.

export const KIND_LABEL: Record<string, string> = {
  weapon: 'Weapon', tool: 'Tool', clothing: 'Clothing', jewel: 'Jewel', document: 'Document', vehicle: 'Vehicle', treasure: 'Treasure', other: 'Other',
}

// Where a holding sits in the book: the start of the story before everything, one whose point is gone from the outline after everything.
const position = (h: ItemHolding, points: StoryPoint[]): number => {
  if (h.at === '') return -1
  const i = points.findIndex(p => p.id === h.at)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

// The holdings in book order (equal places keep the order they were written in).
export function holdingsInOrder(item: ItemDoc, points: StoryPoint[]): ItemHolding[] {
  return item.holdings.map((h, i) => ({ h, i })).sort((a, b) => position(a.h, points) - position(b.h, points) || a.i - b.i).map(x => x.h)
}

// Who has it at a point of the story (the last holding that starts at or before the point); the end of the story when `pointId` is null. Null when nobody has said.
export function holderAt(item: ItemDoc, points: StoryPoint[], pointId: string | null): ItemHolding | null {
  const ordered = holdingsInOrder(item, points)
  if (pointId === null) {
    const known = ordered.filter(h => position(h, points) !== Number.MAX_SAFE_INTEGER)
    return known.length > 0 ? known[known.length - 1] : null
  }
  const here = points.findIndex(p => p.id === pointId)
  if (here < 0) return null
  let found: ItemHolding | null = null
  for (const h of ordered) if (position(h, points) <= here) found = h
  return found
}

// The items a holder (a "char:<id>" or "place:<mapId>/<symbolId>" ref) has at a point of the story (the end of it when null).
export function itemsHeldBy(items: ItemDoc[], holder: string, points: StoryPoint[], pointId: string | null): ItemDoc[] {
  return items.filter(i => holderAt(i, points, pointId)?.holder === holder)
}

// The items a holder has had at any time, each with the first point they got it at (null: from the start) and whether they have it at the end of the story.
export function itemsEverHeldBy(items: ItemDoc[], holder: string, points: StoryPoint[]): Array<{ item: ItemDoc; from: string | null; now: boolean }> {
  const out: Array<{ item: ItemDoc; from: string | null; now: boolean }> = []
  for (const item of items) {
    const mine = holdingsInOrder(item, points).find(h => h.holder === holder)
    if (!mine) continue
    out.push({ item, from: mine.at === '' ? null : mine.at, now: holderAt(item, points, null)?.holder === holder })
  }
  return out
}

// The next point after a holding's (for a new holding: the item moves on from where the last one was).
export function nextPointAfter(item: ItemDoc, points: StoryPoint[]): string {
  const last = holdingsInOrder(item, points).filter(h => position(h, points) !== Number.MAX_SAFE_INTEGER).pop()
  if (!last) return ''
  const i = position(last, points)
  return points[i + 1]?.id ?? points[points.length - 1]?.id ?? ''
}
