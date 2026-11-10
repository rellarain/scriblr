import type { ModelContent, ModelObject, ModelShape } from '../../../../../api/types'

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

// The shapes of an object in the order they are drawn now (back to front), with the order a style gives them.
export function shapesInOrder(c: ModelContent, o: ModelObject, order?: Record<string, string[]>): string[] {
  const shapes = o.shapes.map(id => c.shapes.find(s => s.id === id)).filter((s): s is ModelShape => !!s)
  return drawOrder(c, shapes, undefined, order).map(s => s.id)
}

// The order a style draws an object's shapes in (back to front): the object's own, or (a twin with none of its own) its original's, mapped to the twin's shapes.
function orderOf(c: ModelContent, o: ModelObject, order: Record<string, string[]>): string[] | undefined {
  if (order[o.id]) return order[o.id]
  const from = o.mirrorOf ? order[o.mirrorOf] : undefined
  if (!from) return undefined
  const twinOf = new Map(c.shapes.filter(s => s.mirrorOf && o.shapes.includes(s.id)).map(s => [s.mirrorOf as string, s.id]))
  return from.flatMap(id => (twinOf.has(id) ? [twinOf.get(id) as string] : []))
}

// The shapes in the order they are drawn (back to front). Pass a subset to order just those; a shape with a z of its own sorts by it, ties by the tree.
// `order` (phase D3a) puts the shapes of an object in an order of its own: they take the drawing places they had between them, in that order (shapes of the object it
// leaves out go behind the ones it lists, in the order they had), so what lies between them and the other objects' shapes stays where it was.
export function drawOrder<S extends Pick<ModelShape, 'id' | 'z'>>(c: ModelContent, shapes: S[] = c.shapes as unknown as S[], zOf: (s: S) => number = s => s.z, order?: Record<string, string[]>): S[] {
  const rank = treeRank(c)
  const key = new Map<string, [number, number]>(shapes.map(s => [s.id, [zOf(s), rank.get(s.id) ?? 0]]))
  const before = (a: string, b: string) => key.get(a)![0] - key.get(b)![0] || key.get(a)![1] - key.get(b)![1]
  if (order && Object.keys(order).length > 0) {
    for (const o of c.objects) {
      const wanted = orderOf(c, o, order)
      if (!wanted) continue
      const own = o.shapes.filter(id => key.has(id)).sort(before)
      const listed = [...new Set(wanted)].filter(id => key.has(id) && own.includes(id))
      const sequence = [...own.filter(id => !listed.includes(id)), ...listed]
      const places = own.map(id => key.get(id)!)
      sequence.forEach((id, i) => key.set(id, places[i]))
    }
  }
  return [...shapes].sort((a, b) => key.get(a.id)![0] - key.get(b.id)![0] || key.get(a.id)![1] - key.get(b.id)![1])
}
