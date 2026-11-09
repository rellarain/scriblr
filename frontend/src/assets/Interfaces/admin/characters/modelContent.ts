import type { ModelContent, ModelEntry, ModelGroup, ModelLayer, ModelObject, ModelShape } from '../../../../api/types'
import { LIMITS, copyBytes, linkCount } from './engine/limits'
import { chainOf } from './engine/rig'

// The pure side of the Characters page: editing a model's tree (groups, objects, shapes), the checks Publish makes, and ids and names. Nothing here
// touches the network or React. Every function returns new content and leaves the one it was given alone.

export const NAME_MAX = 60
export const DESCRIPTION_MAX = 400
export const HISTORY_MAX = 10
export const LAYERS: Array<{ id: ModelLayer; name: string }> = [{ id: 'body', name: 'Body' }, { id: 'clothing', name: 'Clothing' }, { id: 'hair', name: 'Hair' }]

export type MakeId = (prefix: string) => string
export const randomId: MakeId = prefix => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

export const RANGE_NAME_MAX = 40
export const AXIS_RANGE = { min: 40, max: 160 } as const

export const blankContent = (name = ''): ModelContent => ({ name, description: '', shapes: [], objects: [], groups: [], axis: 100, ranges: [] })

// A group as the page makes one: no parent, no pivot and no anchor until the rig says otherwise.
export const newGroup = (id: string, name: string, parent: string | null = null, objects: string[] = []): ModelGroup => ({ id, name, parent, objects, pivot: null, attach: null })

const clean = (v: string, max: number): string => v.trim().slice(0, max)

// What a save sends: names trimmed and cut to length, the way the server cleans them (the page keeps what was typed until then).
export function normalizeContent(c: ModelContent): ModelContent {
  return {
    ...c,
    name: clean(c.name, NAME_MAX),
    description: clean(c.description, DESCRIPTION_MAX),
    shapes: c.shapes.map(s => ({ ...s, name: clean(s.name, NAME_MAX), mirrorOf: s.mirrorOf ?? null, back: s.back ?? null, zBack: s.zBack ?? null, loose: s.loose ?? null })),
    objects: c.objects.map(o => ({ ...o, name: clean(o.name, NAME_MAX), mirrorOf: o.mirrorOf ?? null })),
    groups: c.groups.map(g => ({ ...g, name: clean(g.name, NAME_MAX), pivot: g.pivot ?? null, attach: g.attach ?? null, mirrorOf: g.mirrorOf ?? null })),
    axis: c.axis ?? 100,
    ranges: (c.ranges ?? []).map(r => ({ ...r, name: clean(r.name, RANGE_NAME_MAX) })),
  }
}

// `name`, or `name (copy)`, `name (copy 2)` ... when it is taken (compared without case), kept within the name limit.
export function copyName(name: string, entries: Array<{ draft: { name: string } }>): string {
  const taken = new Set(entries.map(e => e.draft.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`
    const candidate = name.slice(0, NAME_MAX - suffix.length).trimEnd() + suffix
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

// The list with the item `id` moved to just before `beforeId` (or to the end for null).
export function moveBefore<T extends { id: string }>(list: T[], id: string, beforeId: string | null): T[] {
  const item = list.find(x => x.id === id)
  if (!item || id === beforeId) return list
  const rest = list.filter(x => x.id !== id)
  const at = beforeId === null ? rest.length : rest.findIndex(x => x.id === beforeId)
  return at < 0 ? list : [...rest.slice(0, at), item, ...rest.slice(at)]
}

// ---- reading ----

export const shapeById = (c: ModelContent, id: string): ModelShape | undefined => c.shapes.find(s => s.id === id)
export const objectById = (c: ModelContent, id: string): ModelObject | undefined => c.objects.find(o => o.id === id)
export const groupById = (c: ModelContent, id: string): ModelGroup | undefined => c.groups.find(g => g.id === id)
export const objectOfShape = (c: ModelContent, shapeId: string): ModelObject | undefined => c.objects.find(o => o.shapes.includes(shapeId))
export const groupOfObject = (c: ModelContent, objectId: string): ModelGroup | undefined => c.groups.find(g => g.objects.includes(objectId))

// The tree the page shows: the three layers, each with the groups that have an object on it, each group's objects of that layer, each object's shapes.
export interface TreeShape { shape: ModelShape }
export interface TreeObject { object: ModelObject; shapes: ModelShape[] }
export interface TreeGroup { group: ModelGroup; objects: TreeObject[] }
export interface TreeLayer { id: ModelLayer; name: string; groups: TreeGroup[]; loose: TreeObject[] }
export function treeOf(c: ModelContent): TreeLayer[] {
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const asTree = (o: ModelObject): TreeObject => ({ object: o, shapes: o.shapes.map(id => shapes.get(id)).filter((s): s is ModelShape => !!s) })
  return LAYERS.map(layer => {
    const groups: TreeGroup[] = []
    for (const g of c.groups) {
      const objs = g.objects.map(id => c.objects.find(o => o.id === id)).filter((o): o is ModelObject => !!o && o.layer === layer.id)
      if (objs.length) groups.push({ group: g, objects: objs.map(asTree) })
    }
    // objects that are in no group yet (a new object is added to a group; these are only from an unfinished draft)
    const loose = c.objects.filter(o => o.layer === layer.id && !c.groups.some(g => g.objects.includes(o.id))).map(asTree)
    return { id: layer.id, name: layer.name, groups, loose }
  })
}

// ---- editing ----

export function updateShape(c: ModelContent, id: string, change: (s: ModelShape) => ModelShape): ModelContent {
  return { ...c, shapes: c.shapes.map(s => (s.id === id ? change(s) : s)) }
}

export function addGroup(c: ModelContent, group: ModelGroup): ModelContent {
  return { ...c, groups: [...c.groups, group] }
}

// A new object in a group (the group lists it), on a layer.
export function addObject(c: ModelContent, groupId: string, object: ModelObject): ModelContent {
  return { ...c, objects: [...c.objects, object], groups: c.groups.map(g => (g.id === groupId ? { ...g, objects: [...g.objects, object.id] } : g)) }
}

// A new shape in an object (the object lists it).
export function addShape(c: ModelContent, objectId: string, shape: ModelShape, afterId?: string): ModelContent {
  return {
    ...c,
    shapes: [...c.shapes, shape],
    objects: c.objects.map(o => {
      if (o.id !== objectId) return o
      const at = afterId ? o.shapes.indexOf(afterId) : -1
      return { ...o, shapes: at >= 0 ? [...o.shapes.slice(0, at + 1), shape.id, ...o.shapes.slice(at + 1)] : [...o.shapes, shape.id] }
    }),
  }
}

// What goes when these shapes, objects and groups go: their twins too (a twin is nothing without its original), and a group's objects and an object's
// shapes with it. Repeats until nothing more is added.
function goneWith(c: ModelContent, seed: { shapes?: string[]; objects?: string[]; groups?: string[] }) {
  const shapes = new Set(seed.shapes ?? []), objects = new Set(seed.objects ?? []), groups = new Set(seed.groups ?? [])
  for (let grew = true; grew;) {
    const before = shapes.size + objects.size + groups.size
    for (const g of c.groups) if (g.mirrorOf && groups.has(g.mirrorOf)) groups.add(g.id)
    for (const o of c.objects) if (o.mirrorOf && objects.has(o.mirrorOf)) objects.add(o.id)
    for (const s of c.shapes) if (s.mirrorOf && shapes.has(s.mirrorOf)) shapes.add(s.id)
    for (const g of c.groups) if (groups.has(g.id)) for (const oid of g.objects) objects.add(oid)
    for (const o of c.objects) if (objects.has(o.id)) for (const sid of o.shapes) shapes.add(sid)
    grew = shapes.size + objects.size + groups.size > before
  }
  return { shapes, objects, groups }
}

function removeAll(c: ModelContent, gone: { shapes: Set<string>; objects: Set<string>; groups: Set<string> }): ModelContent {
  const parentOf = new Map(c.groups.map(g => [g.id, g.parent]))
  const up = (id: string | null): string | null => { let cur = id; while (cur !== null && gone.groups.has(cur)) cur = parentOf.get(cur) ?? null; return cur }
  return {
    ...c,
    shapes: c.shapes.filter(s => !gone.shapes.has(s.id)).map(s => (s.pts.some(p => p.bind && gone.shapes.has(p.bind.s)) ? { ...s, pts: s.pts.map(p => (p.bind && gone.shapes.has(p.bind.s) ? { ...p, bind: null } : p)) } : s)),
    objects: c.objects.filter(o => !gone.objects.has(o.id)).map(o => ({ ...o, shapes: o.shapes.filter(sid => !gone.shapes.has(sid)) })),
    groups: c.groups.filter(g => !gone.groups.has(g.id)).map(g => ({ ...g, parent: up(g.parent), objects: g.objects.filter(oid => !gone.objects.has(oid)) })),
  }
}

// A shape goes with its twin.
export function removeShape(c: ModelContent, id: string): ModelContent {
  return removeAll(c, goneWith(c, { shapes: [id] }))
}

// An object goes with its shapes, and with its twin.
export function removeObject(c: ModelContent, id: string): ModelContent {
  return removeAll(c, goneWith(c, { objects: [id] }))
}

// A group goes with its objects and their shapes, and with its twin; a group under it moves up to its parent.
export function removeGroup(c: ModelContent, id: string): ModelContent {
  if (!groupById(c, id)) return c
  return removeAll(c, goneWith(c, { groups: [id] }))
}

// The twins of a shape, object or group (those that mirror it).
export const twinsOf = (c: ModelContent, kind: 'shape' | 'object' | 'group', id: string): string[] =>
  (kind === 'shape' ? c.shapes : kind === 'object' ? c.objects : c.groups).filter(x => x.mirrorOf === id).map(x => x.id)

// How many points a shape's outline has: a twin has as many as the shape it mirrors.
export function outlineSize(c: ModelContent, s: ModelShape): number {
  const src = s.mirrorOf ? shapeById(c, s.mirrorOf) : undefined
  return src && !src.mirrorOf ? src.pts.length : s.pts.length
}

export const renameShape = (c: ModelContent, id: string, name: string): ModelContent => updateShape(c, id, s => ({ ...s, name }))
export const renameObject = (c: ModelContent, id: string, name: string): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === id ? { ...o, name } : o)) })
export const renameGroup = (c: ModelContent, id: string, name: string): ModelContent => ({ ...c, groups: c.groups.map(g => (g.id === id ? { ...g, name } : g)) })

// A copy of a shape right after the original, in the same object.
export function duplicateShape(c: ModelContent, id: string, newId: string): ModelContent {
  const src = shapeById(c, id), owner = objectOfShape(c, id)
  if (!src || !owner) return c
  if (src.mirrorOf) return c   // a twin has no outline to copy: break the pair first
  const copy: ModelShape = { ...src, id: newId, name: src.name ? `${src.name} (copy)`.slice(0, NAME_MAX) : '', pts: src.pts.map(p => ({ ...p })), back: src.back ? src.back.map(p => ({ ...p })) : src.back }
  return addShape(c, owner.id, copy, id)
}

// A shape moves up or down among the shapes of its object (the later in the list, the higher it is drawn).
export function moveShapeWithin(c: ModelContent, objectId: string, shapeId: string, beforeId: string | null): ModelContent {
  return { ...c, objects: c.objects.map(o => (o.id === objectId ? { ...o, shapes: moveBefore(o.shapes.map(id => ({ id })), shapeId, beforeId).map(x => x.id) } : o)) }
}

// An object moves among the objects of its group (the later in the list, the nearer the front).
export function moveObjectWithin(c: ModelContent, groupId: string, objectId: string, beforeId: string | null): ModelContent {
  return { ...c, groups: c.groups.map(g => (g.id === groupId ? { ...g, objects: moveBefore(g.objects.map(id => ({ id })), objectId, beforeId).map(x => x.id) } : g)) }
}

// The next free id of a kind ('s', 'o', 'g') in the content.
export function freshId(c: ModelContent, prefix: 's' | 'o' | 'g' | 'r', make: MakeId = randomId): string {
  const taken = new Set([...c.shapes.map(s => s.id), ...c.objects.map(o => o.id), ...c.groups.map(g => g.id), ...c.ranges.map(r => r.id)])
  for (let i = 0; i < 20; i++) { const id = make(prefix); if (!taken.has(id)) return id }
  return `${prefix}_${taken.size}_${Date.now().toString(36)}`
}

// ---- the checks Publish makes (the server makes the same ones) ----

const label = (name: string, id: string): string => name || id

function hasCycle(parents: Map<string, string | null>): boolean {
  for (const start of parents.keys()) {
    const seen = new Set([start])
    let cur = parents.get(start) ?? null
    while (cur !== null && parents.has(cur)) {
      if (seen.has(cur)) return true
      seen.add(cur)
      cur = parents.get(cur) ?? null
    }
  }
  return false
}

// What the rig must not have when published (the server makes the same checks in the same words): a pivot chain over the limit, an anchor or a slider
// that points at something that is not there.
function rigFaults(c: ModelContent, circular: boolean, owner: Map<string, string>, holder: Map<string, string>): string[] {
  const faults: string[] = []
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const groupIds = new Set(c.groups.map(g => g.id)), rangeIds = new Set(c.ranges.map(r => r.id))
  const twinGroups = new Map(c.groups.filter(g => g.mirrorOf).map(g => [g.id, g.mirrorOf]))
  if (!circular) {
    for (const g of c.groups) {
      const depth = chainOf(c, g.id).length
      if (depth > LIMITS.chainMax) faults.push(`Group ${label(g.name, g.id)} is ${depth} levels deep; a pivot chain may have at most ${LIMITS.chainMax}.`)
    }
  }
  for (const g of c.groups) {
    const a = g.attach
    if (!a) continue
    const name = label(g.name, g.id), target = shapes.get(a.shape)
    if (g.parent === null) faults.push(`Group ${name} is attached to a shape but has no parent group.`)
    else if (!target) faults.push(`Group ${name} is attached to a shape that does not exist.`)
    else {
      const home = holder.get(owner.get(a.shape) ?? '') ?? ''
      if (!chainOf(c, g.parent).includes(home)) faults.push(`Group ${name} is attached to a shape that is not in its parent group or one above it.`)
      if (a.kind === 'point' && a.i >= outlineSize(c, target)) faults.push(`Group ${name} is attached to a point that does not exist.`)
      if ((a.kind === 'edge' || a.kind === 'range') && a.i >= outlineSize(c, target)) faults.push(`Group ${name} is attached to an edge that does not exist.`)
    }
    if (a.kind === 'range' && !(a.slider && rangeIds.has(a.slider))) faults.push(`Group ${name} is attached along a slider that does not exist.`)
  }
  for (const r of c.ranges) {
    const name = label(r.name, r.id)
    for (const d of r.drives) {
      if (d.kind === 'turn' && !(d.group && groupIds.has(d.group))) faults.push(`Slider ${name} turns a group that does not exist.`)
      else if (d.kind === 'turn' && d.group && twinGroups.get(d.group)) faults.push(`Slider ${name} turns a group that is a twin; turn the original instead.`)
      else if (d.kind === 'scale' && d.target !== 'model' && !((d.target === 'group' && d.id && groupIds.has(d.id)) || (d.target === 'shape' && d.id && shapes.has(d.id)))) faults.push(`Slider ${name} scales something that does not exist.`)
      else if (d.kind === 'scale' && ((d.target === 'group' && d.id && twinGroups.get(d.id)) || (d.target === 'shape' && d.id && shapes.get(d.id)?.mirrorOf))) faults.push(`Slider ${name} scales a twin; scale the original instead.`)
      else if ((d.kind === 'points' || d.kind === 'bend') && !(d.shape && shapes.has(d.shape))) faults.push(`Slider ${name} moves a shape that does not exist.`)
      else if ((d.kind === 'points' || d.kind === 'bend') && d.shape && shapes.get(d.shape)?.mirrorOf) faults.push(`Slider ${name} moves a shape that is a twin; move the original instead.`)
      else if (d.kind === 'points' && d.shape && d.moves.some(m => m.i >= (shapes.get(d.shape!)?.pts.length ?? 0))) faults.push(`Slider ${name} moves a point of ${label(shapes.get(d.shape)?.name ?? '', d.shape)} that is no longer there. Record it again.`)
    }
  }
  return faults
}

// Twins: the original must be there and must not be a twin itself.
function pairFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const kinds: Array<[string, Array<{ id: string; name: string; mirrorOf?: string | null }>]> = [['Shape', c.shapes], ['Object', c.objects], ['Group', c.groups]]
  for (const [kind, items] of kinds) {
    const byId = new Map(items.map(i => [i.id, i]))
    const article = kind === 'Object' ? 'an' : 'a'
    for (const i of items) {
      const src = i.mirrorOf
      if (!src) continue
      const name = label(i.name, i.id)
      if (src === i.id) faults.push(`${kind} ${name} is a twin of itself.`)
      else if (!byId.has(src)) faults.push(`${kind} ${name} is a twin of ${article} ${kind.toLowerCase()} that does not exist.`)
      else if (byId.get(src)!.mirrorOf) faults.push(`${kind} ${name} is a twin of a twin.`)
    }
  }
  return faults
}

// Point links, looseness and back outlines: what they point at must be there, links must not go round in a circle, and there are at most LIMITS.linksMax.
function linkFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const rangeIds = new Set(c.ranges.map(r => r.id))
  const depends = new Map<string, Set<string>>()
  for (const s of c.shapes) {
    const name = label(s.name, s.id)
    for (const p of s.pts) {
      const b = p.bind
      if (!b) continue
      const target = shapes.get(b.s)
      if (b.s === s.id) faults.push(`Shape ${name} has a point linked to its own shape.`)
      else if (!target) faults.push(`Shape ${name} has a point linked to a shape that does not exist.`)
      else {
        depends.set(s.id, (depends.get(s.id) ?? new Set()).add(b.s))
        const size = outlineSize(c, target)
        if (b.kind === 'point' && b.i >= size) faults.push(`Shape ${name} has a point linked to a point that does not exist.`)
        else if (b.kind === 'edge' && b.e >= size) faults.push(`Shape ${name} has a point linked to an edge that does not exist.`)
      }
    }
    if (s.loose != null && !rangeIds.has(s.loose)) faults.push(`Shape ${name} takes its looseness from a slider that does not exist.`)
    if (s.back != null && s.back.length < 3) faults.push(`Shape ${name} has a back outline of fewer than 3 points.`)
  }
  for (const s of c.shapes) {
    const seen = new Set<string>(), stack = [...(depends.get(s.id) ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      if (cur === s.id) { faults.push(`The point links of shape ${label(s.name, s.id)} go round in a circle.`); break }
      if (seen.has(cur)) continue
      seen.add(cur)
      stack.push(...(depends.get(cur) ?? []))
    }
  }
  if (linkCount(c) > LIMITS.linksMax) faults.push(`A model may have at most ${LIMITS.linksMax} point links.`)
  return faults
}

export function publishFaults(c: ModelContent): string[] {
  const faults: string[] = []
  if (!c.name.trim()) faults.push('The model needs a name.')
  const shapeIds = new Set(c.shapes.map(s => s.id)), objectIds = new Set(c.objects.map(o => o.id)), groupIds = new Set(c.groups.map(g => g.id))
  for (const s of c.shapes) if (s.pts.length < 3 && !s.mirrorOf) faults.push(`Shape ${label(s.name, s.id)} needs at least 3 points.`)
  const owner = new Map<string, string>()
  for (const o of c.objects) {
    for (const sid of o.shapes) {
      if (!shapeIds.has(sid)) faults.push(`Object ${label(o.name, o.id)} lists a shape that does not exist.`)
      else if (owner.has(sid) && owner.get(sid) !== o.id) faults.push(`A shape is in more than one object (${label(o.name, o.id)}).`)
      else owner.set(sid, o.id)
    }
  }
  const holder = new Map<string, string>()
  for (const g of c.groups) {
    for (const oid of g.objects) {
      if (!objectIds.has(oid)) faults.push(`Group ${label(g.name, g.id)} lists an object that does not exist.`)
      else if (holder.has(oid) && holder.get(oid) !== g.id) faults.push(`An object is in more than one group (${label(g.name, g.id)}).`)
      else holder.set(oid, g.id)
    }
    if (g.parent !== null && !groupIds.has(g.parent)) faults.push(`Group ${label(g.name, g.id)} has a parent that does not exist.`)
  }
  const circular = hasCycle(new Map(c.groups.map(g => [g.id, g.parent])))
  if (circular) faults.push('The groups are linked in a circle.')
  faults.push(...rigFaults(c, circular, owner, holder))
  faults.push(...pairFaults(c))
  faults.push(...linkFaults(c))
  const bytes = copyBytes(c)
  if (bytes > LIMITS.copyMaxBytes) faults.push(`A character's copy of this model would be ${Math.floor(bytes / 1024)} KB; the limit is ${LIMITS.copyMaxBytes / 1024} KB.`)
  return faults
}

// Whether the draft is what was published (names and tree alike).
export const sameContent = (a: ModelContent, b: ModelContent): boolean => JSON.stringify(normalizeContent(a)) === JSON.stringify(normalizeContent(b))

export type PublishState = 'draft' | 'published' | 'changed' | 'unpublished'
// Where a model stands: never published, published and unchanged, published with edits since, or taken off (it has versions but none is live).
export function publishState(e: ModelEntry): PublishState {
  if (e.published) return sameContent(e.draft, e.published.content) ? 'published' : 'changed'
  return e.history.length ? 'unpublished' : 'draft'
}
