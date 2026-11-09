import type { ModelContent, ModelShape } from '../../../../../api/types'

// The order shapes are drawn in: lowest z first, and shapes of the same z in the order of the tree (the Body layer, then Clothing, then Hair; inside a
// layer the groups in their order, their objects, and each object's shapes: the later in a list, the nearer the front). So the up and down arrows
// of the tree change what is in front, and a clothing shape lies over a body shape unless a z says otherwise.
const LAYER_ORDER = ['body', 'clothing', 'hair'] as const

// Each shape's place in the tree walk (0 = the first drawn of equal z). Shapes in no object come last, in the order of the content.
export function treeRank(c: ModelContent): Map<string, number> {
  const rank = new Map<string, number>()
  const objects = new Map(c.objects.map(o => [o.id, o]))
  const seenObjects = new Set<string>()
  const take = (shapeIds: string[]) => { for (const id of shapeIds) if (!rank.has(id)) rank.set(id, rank.size) }
  for (const layer of LAYER_ORDER) {
    for (const g of c.groups) {
      for (const oid of g.objects) {
        const o = objects.get(oid)
        if (o && o.layer === layer) { seenObjects.add(oid); take(o.shapes) }
      }
    }
    for (const o of c.objects) if (o.layer === layer && !seenObjects.has(o.id) && !c.groups.some(g => g.objects.includes(o.id))) { seenObjects.add(o.id); take(o.shapes) }
  }
  for (const s of c.shapes) if (!rank.has(s.id)) rank.set(s.id, rank.size)
  return rank
}

// The shapes in the order they are drawn (back to front). Pass a subset to order just those; a shape with a z of its own sorts by it, ties by the tree.
export function drawOrder<S extends Pick<ModelShape, 'id' | 'z'>>(c: ModelContent, shapes: S[] = c.shapes as unknown as S[], zOf: (s: S) => number = s => s.z): S[] {
  const rank = treeRank(c)
  return [...shapes].sort((a, b) => zOf(a) - zOf(b) || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
}
