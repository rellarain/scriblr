import type { ModelContent, ModelLayer, ModelObject, ModelShape } from '../../../../../api/types'

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
export function drawOrder<S extends Pick<ModelShape, 'id' | 'z'>>(c: ModelContent, shapes: S[] = c.shapes as unknown as S[], zOf: (s: S) => number = s => s.z, order?: Record<string, string[]>, zoff?: LayerOffsets): S[] {
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
  const sorted = [...shapes].sort((a, b) => key.get(a.id)![0] - key.get(b.id)![0] || key.get(a.id)![1] - key.get(b.id)![1])
  return zoff && Object.keys(zoff).length > 0 ? withLayerOffsets(c, sorted, zoff) : sorted
}

// ---- moving a garment or a hair part among the parts of its layer (phase 6b-3) ----

// How many places each part of a layer has been moved from where the model puts it, toward the front (+) or the back (-), by the key of the part (a LayerUnit).
export type LayerOffsets = Record<string, number>

// A part of a layer that is moved as one: an object with its twins (a left and a right sleeve go together), or, for a family of objects (a class), its template and every member with
// their twins (the shirt shown is the one that is moved, whichever it is). Its key is the id of that object (of the family: its template). `base` is its place among the parts of its
// layer where the model puts it (0 is the back), from the order its shapes are drawn in, whether or not anything of it is shown.
export interface LayerUnit { key: string; layer: ModelLayer; objects: ModelObject[]; base: number }

export function layerUnits(c: ModelContent, layer: ModelLayer): LayerUnit[] {
  const byId = new Map(c.objects.map(o => [o.id, o]))
  const rootOf = (o: ModelObject): ModelObject => (o.mirrorOf ? byId.get(o.mirrorOf) ?? o : o)
  const keyOf = (o: ModelObject): string => {
    const root = rootOf(o)
    const klass = root.classOf ? (c.classes ?? []).find(k => k.id === root.classOf) : undefined
    return klass ? klass.template : root.id
  }
  const groups = new Map<string, ModelObject[]>()
  for (const o of c.objects) {
    if (rootOf(o).layer !== layer) continue
    const key = keyOf(o)
    groups.set(key, [...(groups.get(key) ?? []), o])
  }
  const rank = treeRank(c), zOf = new Map(c.shapes.map(s => [s.id, s.z]))
  const top = (objects: ModelObject[]): [number, number] => {
    let z = -1e9, r = -1e9   // an object with no shape goes to the back
    for (const o of objects) for (const id of o.shapes) {
      const sz = zOf.get(id) ?? 0, sr = rank.get(id) ?? 0
      if (sz > z || (sz === z && sr > r)) { z = sz; r = sr }
    }
    return [z, r]
  }
  return [...groups.entries()]
    .map(([key, objects]) => ({ key, layer, objects, at: top(objects) }))
    .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
    .map(({ key, layer: l, objects }, base) => ({ key, layer: l, objects, base }))
}

// The parts of a layer in the order they are drawn now (back to front): where the model puts them, then moved by `zoff`.
export function orderedUnits(c: ModelContent, layer: ModelLayer, zoff: LayerOffsets = {}): LayerUnit[] {
  return layerUnits(c, layer).sort((a, b) => a.base + (zoff[a.key] ?? 0) - (b.base + (zoff[b.key] ?? 0)) || a.base - b.base)
}

// The shapes after the parts of each layer have been moved: the shapes of a layer keep the places they have among all the shapes drawn, but go to the parts in their new order (each
// part's shapes together, in the order they had), so what lies between them, of other layers, stays where it was.
function withLayerOffsets<S extends Pick<ModelShape, 'id'>>(c: ModelContent, sorted: S[], zoff: LayerOffsets): S[] {
  const out = [...sorted]
  for (const layer of LAYER_ORDER) {
    const units = layerUnits(c, layer)
    if (!units.some(u => (zoff[u.key] ?? 0) !== 0)) continue
    const unitOf = new Map<string, string>()
    for (const u of units) for (const o of u.objects) for (const id of o.shapes) unitOf.set(id, u.key)
    const places: number[] = [], shapesOf = new Map<string, S[]>()
    out.forEach((s, i) => {
      const key = unitOf.get(s.id)
      if (key === undefined) return
      places.push(i)
      shapesOf.set(key, [...(shapesOf.get(key) ?? []), s])
    })
    const sequence = units
      .filter(u => shapesOf.has(u.key))
      .sort((a, b) => a.base + (zoff[a.key] ?? 0) - (b.base + (zoff[b.key] ?? 0)) || a.base - b.base)
      .flatMap(u => shapesOf.get(u.key)!)
    places.forEach((p, i) => { out[p] = sequence[i] })
  }
  return out
}
